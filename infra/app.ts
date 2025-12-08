#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ObsidianMcpStack } from "./stack.js";

const app = new cdk.App();

new ObsidianMcpStack(app, "ObsidianMcpStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "Obsidian S3 MCP Server - Remote access to Obsidian vault via Claude",
});
