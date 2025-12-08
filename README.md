# Obsidian S3 MCP Server

A remote MCP (Model Context Protocol) server that gives Claude access to your Obsidian vault via S3. Access your notes from Claude on mobile, web, or desktop - anywhere.

## Features

- **Read notes** - Read any note by path
- **Write notes** - Create or update notes
- **List files** - Browse your vault structure
- **Search notes** - Full-text search across your vault
- **OAuth 2.0** - Secure authentication for Claude connectors
- **Serverless** - Runs on AWS Lambda, costs < $1/month for personal use

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       S3 Bucket                              │
│                  (single source of truth)                    │
│                      *.md files                              │
└─────────────────────────────────────────────────────────────┘
        ▲                                       ▲
        │                                       │
        │ Direct read/write                     │ Sync (pull/push)
        │ via AWS SDK                           │ via Remotely Save
        │                                       │
┌───────┴───────┐                     ┌─────────┴─────────┐
│  MCP Server   │                     │     Obsidian      │
│   (Lambda)    │                     │   (on devices)    │
└───────────────┘                     └───────────────────┘
        ▲
        │
┌───────┴───────┐
│    Claude     │
│ Mobile / Web  │
└───────────────┘
```

## Prerequisites

- Node.js 22+
- AWS CLI configured with credentials
- AWS CDK CLI (`npm install -g aws-cdk`)
- An AWS account

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-username/obsidian-s3-mcp.git
cd obsidian-s3-mcp
npm install
```

### 2. Configure AWS

If you haven't already, configure AWS CLI with your credentials:

```bash
aws configure --profile obsidian-mcp
```

Enter your AWS Access Key ID, Secret Access Key, and region (us-east-1 recommended).

### 3. Bootstrap CDK (First Time Only)

```bash
cd infra
AWS_PROFILE=obsidian-mcp npx cdk bootstrap
cd ..
```

### 4. Deploy

```bash
AWS_PROFILE=obsidian-mcp npm run deploy
```

This creates:
- S3 bucket for your vault (versioned, encrypted)
- Lambda function running the MCP server
- API Gateway with OAuth endpoints

Note the outputs, especially the `McpUrl`.

### 5. Upload Your Vault

Sync your existing Obsidian vault to S3:

```bash
aws s3 sync "/path/to/your/obsidian/vault" \
  s3://obsidian-vault-YOUR_ACCOUNT_ID-us-east-1/ \
  --profile obsidian-mcp
```

### 6. Connect Claude

1. Go to [claude.ai](https://claude.ai) → Settings → Connectors
2. Click "Add custom connector"
3. Enter:
   - **Name:** Obsidian Vault
   - **URL:** Your `McpUrl` from the deploy output (e.g., `https://xxx.execute-api.us-east-1.amazonaws.com/mcp`)
4. Leave OAuth Client ID and Secret empty (uses automatic registration)
5. Click "Add"

Claude will automatically authenticate via OAuth and connect to your vault.

## Setting Up Obsidian Sync

To keep your local Obsidian vault in sync with S3, use the **Remotely Save** plugin:

### Install Remotely Save

1. In Obsidian: Settings → Community Plugins → Browse
2. Search "Remotely Save" → Install → Enable

### Configure S3 Connection

1. Settings → Remotely Save → Choose Service: **S3 or S3-compatible**
2. Configure:
   - **Endpoint:** Leave blank for AWS S3
   - **Region:** `us-east-1` (or your region)
   - **Access Key ID:** Your AWS access key
   - **Secret Access Key:** Your AWS secret key
   - **Bucket Name:** `obsidian-vault-YOUR_ACCOUNT_ID-us-east-1`

3. Click "Check" to verify the connection
4. Enable auto-sync on open/close

Now your Obsidian vault syncs to S3, and Claude can access it via the MCP server.

## Available Tools

| Tool | Description | Example |
|------|-------------|---------|
| `read_note` | Read a note's contents | "Read my note about project ideas" |
| `write_note` | Create or update a note | "Create a new note with today's meeting notes" |
| `list_files` | List files and folders | "What folders are in my vault?" |
| `search_notes` | Search note contents | "Find notes mentioning 'vacation'" |

## Development

### Run Locally

```bash
export S3_BUCKET_NAME="your-bucket-name"
export AWS_PROFILE="obsidian-mcp"
npm run dev
```

Server runs at `http://localhost:8080`.

### Run Tests

```bash
npm test
```

### Project Structure

```
obsidian-s3-mcp/
├── src/
│   ├── index.ts          # Express server entry point
│   ├── server.ts         # MCP server setup
│   ├── auth/
│   │   └── oauth.ts      # OAuth 2.0 implementation
│   ├── s3/
│   │   ├── client.ts     # S3 client singleton
│   │   └── operations.ts # S3 CRUD operations
│   ├── tools/
│   │   ├── read.ts       # read_note tool
│   │   ├── write.ts      # write_note tool
│   │   ├── list.ts       # list_files tool
│   │   └── search.ts     # search_notes tool
│   └── types/
│       └── index.ts      # TypeScript types
├── infra/
│   ├── stack.ts          # AWS CDK infrastructure
│   └── app.ts            # CDK app entry point
├── test/                 # Unit tests
├── package.json
└── tsconfig.json
```

## Cost Estimate

For personal use (single user, ~1000 notes):

| Service | Monthly Cost |
|---------|--------------|
| Lambda | ~$0 (free tier) |
| S3 | ~$0.02 |
| API Gateway | ~$0 (free tier) |
| **Total** | **< $1/month** |

## Security

- **OAuth 2.0** with PKCE for authentication
- **S3 encryption** at rest (SSE-S3)
- **HTTPS only** for all endpoints
- **No credentials in code** - uses IAM roles

## Troubleshooting

### "Internal Server Error" on health check

Check Lambda logs:
```bash
aws logs tail "/aws/lambda/ObsidianMcpStack-McpHandler*" --since 10m --profile obsidian-mcp
```

### OAuth flow not completing

1. Ensure all OAuth endpoints are deployed (check API Gateway in AWS Console)
2. Try removing and re-adding the connector in Claude

### Notes not syncing

1. Verify Remotely Save plugin is configured correctly
2. Check S3 bucket permissions
3. Try manual sync in Obsidian (Command Palette → Remotely Save: Sync)

## License

MIT
