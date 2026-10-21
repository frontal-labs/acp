# MCP TypeScript + OCP

This example connects to a local MCP server, calls one tool, and maps text
content into an OCP `message.sent` event. It makes the tool boundary visible;
the MCP response is not authorization to perform a state-changing operation.

## Install and run

```bash
npm install --prefix examples/mcp-typescript
npm start --prefix examples/mcp-typescript
```

The default command is illustrative. For a real server, set:

```bash
export MCP_SERVER_COMMAND=node
export MCP_SERVER_ARGS='["path/to/server.js"]'
export MCP_TOOL_NAME=your_tool
npm start --prefix examples/mcp-typescript
```

## Safety boundary

Before `client.callTool`, production code should submit a typed OCP action to
the runtime policy engine when the tool changes state. If approval is required,
pause the harness and resume only after an explicit `approval.granted` event.
