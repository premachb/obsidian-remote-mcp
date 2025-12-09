import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Construct } from "constructs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ObsidianMcpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for Obsidian vault
    const vaultBucket = new s3.Bucket(this, "ObsidianVaultBucket", {
      bucketName: `obsidian-vault-${this.account}-${this.region}`,
      versioned: true, // Enable versioning for note history
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete vault on stack destroy
    });

    // Lambda Web Adapter layer ARN for us-east-1
    // See: https://github.com/awslabs/aws-lambda-web-adapter
    const webAdapterLayerArn = `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerX86:22`;

    // Lambda function using Web Adapter
    // The web adapter runs our Express app via the run.sh script
    const mcpHandler = new nodejs.NodejsFunction(this, "McpHandler", {
      entry: path.join(__dirname, "../src/index.ts"),
      handler: "run.sh", // Point to run.sh for web adapter
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.X86_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        // Web adapter config
        AWS_LAMBDA_EXEC_WRAPPER: "/opt/bootstrap",
        AWS_LWA_READINESS_CHECK_PATH: "/health",
        AWS_LWA_PORT: "8080",
        PORT: "8080",
        // App config
        S3_BUCKET_NAME: vaultBucket.bucketName,
        // JWT secret for OAuth tokens (survives Lambda cold starts)
        JWT_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        format: nodejs.OutputFormat.ESM,
        mainFields: ["module", "main"],
        externalModules: ["@aws-sdk/*"], // Use Lambda-provided SDK
        banner:
          "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            // Create run.sh script that Lambda Web Adapter will execute
            `echo '#!/bin/bash' > ${outputDir}/run.sh`,
            `echo 'exec node index.mjs' >> ${outputDir}/run.sh`,
            `chmod +x ${outputDir}/run.sh`,
          ],
        },
      },
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "WebAdapterLayer",
          webAdapterLayerArn
        ),
      ],
    });

    // Grant Lambda permissions
    vaultBucket.grantReadWrite(mcpHandler);

    // HTTP API Gateway
    const httpApi = new apigateway.HttpApi(this, "McpHttpApi", {
      apiName: "ObsidianMcpApi",
      description: "HTTP API for Obsidian MCP Server",
      corsPreflight: {
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: [
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Lambda integration
    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      "McpLambdaIntegration",
      mcpHandler
    );

    // Routes - MCP endpoint
    httpApi.addRoutes({
      path: "/mcp",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // Health check
    httpApi.addRoutes({
      path: "/health",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // OAuth 2.0 endpoints
    httpApi.addRoutes({
      path: "/.well-known/oauth-authorization-server",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/register",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/authorize",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/token",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    // Stack outputs
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: httpApi.apiEndpoint,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "McpUrl", {
      value: `${httpApi.apiEndpoint}/mcp`,
      description: "MCP Server URL for Claude configuration",
    });

    new cdk.CfnOutput(this, "HealthCheckUrl", {
      value: `${httpApi.apiEndpoint}/health`,
      description: "Health check endpoint URL",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: vaultBucket.bucketName,
      description: "S3 bucket name for Obsidian vault",
    });

    new cdk.CfnOutput(this, "OAuthMetadataUrl", {
      value: `${httpApi.apiEndpoint}/.well-known/oauth-authorization-server`,
      description: "OAuth 2.0 Authorization Server Metadata URL",
    });
  }
}
