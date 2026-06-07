import * as http from 'http';
import { randomUUID, timingSafeEqual } from 'crypto';
import Ajv, { ValidateFunction } from 'ajv';
import { Server as MCPProtocolServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
    MCPServerSettings,
    ServerStatus,
    ToolConfig,
    ToolDefinition,
    ToolExecutor,
    ToolResponse
} from './types';
import { SceneTools } from './tools/scene-tools';
import { NodeTools } from './tools/node-tools';
import { ComponentTools } from './tools/component-tools';
import { PrefabTools } from './tools/prefab-tools';
import { ProjectTools } from './tools/project-tools';
import { DebugTools } from './tools/debug-tools';
import { PreferencesTools } from './tools/preferences-tools';
import { ServerTools } from './tools/server-tools';
import { BroadcastTools } from './tools/broadcast-tools';
import { SceneAdvancedTools } from './tools/scene-advanced-tools';
import { SceneViewTools } from './tools/scene-view-tools';
import { ReferenceImageTools } from './tools/reference-image-tools';
import { AssetAdvancedTools } from './tools/asset-advanced-tools';
import { ValidationTools } from './tools/validation-tools';
import { getToolAnnotations, requiresConfirmation } from './tools/tool-security';
import { debugLog, setDebugLogging } from './logger';

const SERVER_VERSION = '1.0.0';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

const TOOL_OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        success: { type: 'boolean' },
        data: {},
        message: { type: 'string' },
        error: { type: 'string' },
        instruction: { type: 'string' },
        warning: { type: 'string' },
        verificationData: {},
        updatedProperties: {
            type: 'array',
            items: { type: 'string' }
        }
    },
    required: ['success'],
    additionalProperties: true
};

interface RegisteredTool {
    category: string;
    methodName: string;
    executor: ToolExecutor;
    definition: ToolDefinition;
}

interface ProtocolRuntime {
    server: MCPProtocolServer;
    transport: StreamableHTTPServerTransport;
    lastActivity: number;
}

class RequestBodyTooLargeError extends Error {}
class ToolDisabledError extends Error {}
class ToolConfirmationError extends Error {}
class ToolTimeoutError extends Error {}

class ToolValidationError extends Error {
    constructor(message: string, public readonly details: unknown) {
        super(message);
    }
}

export class MCPServer {
    private readonly settings: MCPServerSettings;
    private readonly tools: Record<string, ToolExecutor> = {};
    private readonly registeredTools = new Map<string, RegisteredTool>();
    private readonly validators = new Map<string, ValidateFunction>();
    private readonly ajv = new Ajv({ allErrors: true, strict: false, useDefaults: true });
    private readonly protocolRuntimes = new Map<string, ProtocolRuntime>();
    private httpServer: http.Server | null = null;
    private toolsList: ToolDefinition[] = [];
    private enabledToolNames: Set<string> | null = null;
    private activeRequests = 0;
    private sessionCleanupTimer: NodeJS.Timeout | null = null;

    constructor(settings: MCPServerSettings) {
        this.settings = settings;
        setDebugLogging(settings.enableDebugLog);
        this.initializeTools();
        this.rebuildToolsList();
    }

    private initializeTools(): void {
        this.tools.scene = new SceneTools();
        this.tools.node = new NodeTools();
        this.tools.component = new ComponentTools();
        this.tools.prefab = new PrefabTools();
        this.tools.project = new ProjectTools();
        this.tools.debug = new DebugTools();
        this.tools.preferences = new PreferencesTools();
        this.tools.server = new ServerTools();
        this.tools.broadcast = new BroadcastTools();
        this.tools.sceneAdvanced = new SceneAdvancedTools();
        this.tools.sceneView = new SceneViewTools();
        this.tools.referenceImage = new ReferenceImageTools();
        this.tools.assetAdvanced = new AssetAdvancedTools();
        this.tools.validation = new ValidationTools();

        for (const [category, executor] of Object.entries(this.tools)) {
            for (const rawDefinition of executor.getTools()) {
                const qualifiedName = `${category}_${rawDefinition.name}`;
                const definition = this.decorateToolDefinition(qualifiedName, rawDefinition);
                this.registeredTools.set(qualifiedName, {
                    category,
                    methodName: rawDefinition.name,
                    executor,
                    definition
                });
            }
        }
    }

    private decorateToolDefinition(qualifiedName: string, definition: ToolDefinition): ToolDefinition {
        const inputSchema = {
            ...definition.inputSchema,
            properties: { ...(definition.inputSchema?.properties ?? {}) }
        };

        if (requiresConfirmation(qualifiedName)) {
            inputSchema.properties.confirm = {
                type: 'boolean',
                const: true,
                description: 'Must be true to confirm this destructive or high-risk operation'
            };
            inputSchema.required = Array.from(new Set([
                ...(definition.inputSchema?.required ?? []),
                'confirm'
            ]));
        }

        return {
            ...definition,
            name: qualifiedName,
            inputSchema,
            outputSchema: definition.outputSchema ?? TOOL_OUTPUT_SCHEMA,
            annotations: {
                ...getToolAnnotations(qualifiedName),
                ...(definition.annotations ?? {})
            }
        };
    }

    public async start(): Promise<void> {
        if (this.httpServer) return;

        const server = http.createServer((req, res) => {
            void this.handleHttpRequest(req, res);
        });
        server.requestTimeout = this.settings.toolExecutionTimeoutMs + 5000;
        server.headersTimeout = Math.min(server.requestTimeout, 15000);
        server.keepAliveTimeout = 5000;
        server.maxRequestsPerSocket = 100;

        try {
            await new Promise<void>((resolve, reject) => {
                const onError = (error: Error) => {
                    server.off('listening', onListening);
                    reject(error);
                };
                const onListening = () => {
                    server.off('error', onError);
                    resolve();
                };
                server.once('error', onError);
                server.once('listening', onListening);
                server.listen(this.settings.port, '127.0.0.1');
            });
            this.httpServer = server;
            const sessionIdleTimeoutMs = this.getSessionIdleTimeoutMs();
            const cleanupInterval = Math.max(
                250,
                Math.min(Math.floor(sessionIdleTimeoutMs / 2), 60_000)
            );
            this.sessionCleanupTimer = setInterval(
                () => this.removeExpiredProtocolRuntimes(),
                cleanupInterval
            );
            this.sessionCleanupTimer.unref?.();
            this.debug(`Started on http://127.0.0.1:${this.getListeningPort()}`);
        } catch (error) {
            throw error;
        }
    }

    public async stop(): Promise<void> {
        const server = this.httpServer;
        this.httpServer = null;
        if (this.sessionCleanupTimer) {
            clearInterval(this.sessionCleanupTimer);
            this.sessionCleanupTimer = null;
        }
        await this.closeAllProtocolRuntimes();

        if (server) {
            await new Promise<void>((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
                server.closeIdleConnections?.();
            });
        }

        this.debug('Stopped');
    }

    public getStatus(): ServerStatus {
        return {
            running: this.httpServer?.listening ?? false,
            port: this.getListeningPort(),
            clients: this.protocolRuntimes.size
        };
    }

    public getSettings(): MCPServerSettings {
        return { ...this.settings, allowedOrigins: [...this.settings.allowedOrigins] };
    }

    public getAvailableTools(): ToolDefinition[] {
        return [...this.toolsList];
    }

    public getFilteredTools(enabledTools: ToolConfig[]): ToolDefinition[] {
        const enabledSet = new Set(enabledTools.map(tool => `${tool.category}_${tool.name}`));
        return Array.from(this.registeredTools.entries())
            .filter(([name]) => enabledSet.has(name))
            .map(([, tool]) => tool.definition);
    }

    public updateEnabledTools(enabledTools: ToolConfig[]): void {
        this.enabledToolNames = new Set(enabledTools.map(tool => `${tool.category}_${tool.name}`));
        this.rebuildToolsList();
        for (const runtime of this.protocolRuntimes.values()) {
            runtime.server.sendToolListChanged().catch(error => {
                this.debug(`Unable to send tools/list_changed: ${this.getErrorMessage(error)}`);
            });
        }
    }

    public async executeToolCall(toolName: string, args: unknown): Promise<ToolResponse> {
        const registered = this.registeredTools.get(toolName);
        if (!registered) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        if (this.enabledToolNames !== null && !this.enabledToolNames.has(toolName)) {
            throw new ToolDisabledError(`Tool is disabled: ${toolName}`);
        }

        const normalizedArgs: Record<string, unknown> = this.isRecord(args) ? { ...args } : {};
        const validator = this.getValidator(toolName, registered.definition.inputSchema);
        if (!validator(normalizedArgs)) {
            throw new ToolValidationError(
                `Invalid arguments for tool ${toolName}`,
                validator.errors ?? []
            );
        }
        if (requiresConfirmation(toolName) && normalizedArgs.confirm !== true) {
            throw new ToolConfirmationError(`Tool ${toolName} requires confirm=true`);
        }
        delete normalizedArgs.confirm;

        let timeout: NodeJS.Timeout | undefined;
        try {
            return await Promise.race([
                registered.executor.execute(registered.methodName, normalizedArgs),
                new Promise<ToolResponse>((_, reject) => {
                    timeout = setTimeout(() => {
                        reject(new ToolTimeoutError(
                            `Tool ${toolName} timed out after ${this.settings.toolExecutionTimeoutMs}ms`
                        ));
                    }, this.settings.toolExecutionTimeoutMs);
                })
            ]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    private async createProtocolRuntime(): Promise<ProtocolRuntime> {
        const protocolServer = new MCPProtocolServer(
            { name: 'cocos-mcp-server', version: SERVER_VERSION },
            {
                capabilities: {
                    tools: { listChanged: true }
                },
                instructions: 'Use read-only query tools before mutation tools. High-risk tools require confirm=true.'
            }
        );

        protocolServer.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: this.getAvailableTools()
        }));

        protocolServer.setRequestHandler(CallToolRequestSchema, async request => {
            try {
                const result = await this.executeToolCall(
                    request.params.name,
                    request.params.arguments ?? {}
                );
                return this.toCallToolResult(result);
            } catch (error) {
                return this.toCallToolResult(this.toToolError(error));
            }
        });

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: randomUUID,
            enableJsonResponse: true
        });

        await protocolServer.connect(transport);
        return {
            server: protocolServer,
            transport,
            lastActivity: Date.now()
        };
    }

    private async closeProtocolRuntime(runtime: ProtocolRuntime): Promise<void> {
        await runtime.server.close().catch(() => undefined);
    }

    private async closeAllProtocolRuntimes(): Promise<void> {
        const runtimes = Array.from(this.protocolRuntimes.values());
        this.protocolRuntimes.clear();
        await Promise.all(runtimes.map(runtime => this.closeProtocolRuntime(runtime)));
    }

    private rebuildToolsList(): void {
        this.toolsList = Array.from(this.registeredTools.entries())
            .filter(([name]) => this.enabledToolNames === null || this.enabledToolNames.has(name))
            .map(([, tool]) => tool.definition);
    }

    private getValidator(toolName: string, schema: object): ValidateFunction {
        let validator = this.validators.get(toolName);
        if (!validator) {
            validator = this.ajv.compile(schema);
            this.validators.set(toolName, validator);
        }
        return validator;
    }

    private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        try {
            if (!this.isAllowedHost(req.headers.host)) {
                this.sendJson(res, 403, { error: 'Forbidden host' });
                return;
            }

            const origin = this.getHeader(req.headers.origin);
            if (origin && !this.isAllowedOrigin(origin)) {
                this.sendJson(res, 403, { error: 'Forbidden origin' });
                return;
            }
            if (origin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }

            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
                res.setHeader(
                    'Access-Control-Allow-Headers',
                    'Accept, Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, X-MCP-Token'
                );
                res.writeHead(204);
                res.end();
                return;
            }

            const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
            if (pathname === '/health' && req.method === 'GET') {
                this.sendJson(res, 200, {
                    status: 'ok',
                    running: this.httpServer?.listening ?? false,
                    tools: this.toolsList.length,
                    sessions: this.protocolRuntimes.size,
                    activeRequests: this.activeRequests
                });
                return;
            }

            if (!this.isAuthenticated(req)) {
                res.setHeader('WWW-Authenticate', 'Bearer realm="cocos-mcp-server"');
                this.sendJson(res, 401, { error: 'Unauthorized' });
                return;
            }

            if (this.activeRequests >= this.settings.maxConnections) {
                this.sendJson(res, 429, { error: 'Too many active requests' });
                return;
            }

            this.activeRequests++;
            try {
                if (pathname === '/mcp') {
                    await this.handleMCPRequest(req, res);
                    return;
                }

                if (!this.settings.enableRestApi) {
                    this.sendJson(res, 404, { error: 'Not found' });
                    return;
                }
                if (pathname === '/api/tools' && req.method === 'GET') {
                    this.sendJson(res, 200, { tools: this.getSimplifiedToolsList() });
                    return;
                }
                if (pathname.startsWith('/api/') && req.method === 'POST') {
                    await this.handleSimpleAPIRequest(req, res, pathname);
                    return;
                }

                this.sendJson(res, 404, { error: 'Not found' });
            } finally {
                this.activeRequests--;
            }
        } catch (error) {
            if (res.headersSent) {
                res.end();
                return;
            }
            if (error instanceof RequestBodyTooLargeError) {
                this.sendJson(res, 413, { error: error.message });
                return;
            }
            debugLog('MCPServer', 'Unhandled request error', error);
            this.sendJson(res, 500, { error: 'Internal server error' });
        }
    }

    private async handleMCPRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        let parsedBody: unknown;
        if (req.method === 'POST') {
            const body = await this.readRequestBody(req);
            try {
                parsedBody = JSON.parse(body);
            } catch (error) {
                this.sendJson(res, 400, {
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32700,
                        message: `Parse error: ${this.getErrorMessage(error)}`
                    }
                });
                return;
            }
        }

        this.removeExpiredProtocolRuntimes();

        if (req.method === 'POST' && this.isInitializeRequest(parsedBody)) {
            const maxSessions = Number.isFinite(this.settings.maxSessions)
                ? this.settings.maxSessions
                : this.settings.maxConnections;
            if (this.protocolRuntimes.size >= maxSessions) {
                this.sendJson(res, 429, { error: 'Maximum MCP sessions reached' });
                return;
            }

            const runtime = await this.createProtocolRuntime();
            try {
                await runtime.transport.handleRequest(req, res, parsedBody);
                const sessionId = runtime.transport.sessionId;
                if (!sessionId) {
                    throw new Error('MCP initialization did not create a session');
                }
                runtime.lastActivity = Date.now();
                this.protocolRuntimes.set(sessionId, runtime);
            } catch (error) {
                await this.closeProtocolRuntime(runtime);
                throw error;
            }
            return;
        }

        const sessionId = this.getHeader(req.headers['mcp-session-id']);
        const runtime = sessionId ? this.protocolRuntimes.get(sessionId) : undefined;
        if (!runtime) {
            this.sendJson(res, sessionId ? 404 : 400, {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32000,
                    message: sessionId ? 'MCP session not found' : 'MCP-Session-Id header is required'
                }
            });
            return;
        }

        runtime.lastActivity = Date.now();
        await runtime.transport.handleRequest(req, res, parsedBody);
        if (req.method === 'DELETE') {
            this.protocolRuntimes.delete(sessionId!);
            await this.closeProtocolRuntime(runtime);
        }
    }

    private removeExpiredProtocolRuntimes(): void {
        const expirationTime = Date.now() - this.getSessionIdleTimeoutMs();
        for (const [sessionId, runtime] of this.protocolRuntimes) {
            if (runtime.lastActivity < expirationTime) {
                this.protocolRuntimes.delete(sessionId);
                void this.closeProtocolRuntime(runtime);
            }
        }
    }

    private isInitializeRequest(body: unknown): boolean {
        if (Array.isArray(body)) {
            return body.some(item => this.isInitializeRequest(item));
        }
        return this.isRecord(body) && body.method === 'initialize';
    }

    private async handleSimpleAPIRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        pathname: string
    ): Promise<void> {
        const pathParts = pathname.split('/').filter(Boolean);
        if (pathParts.length !== 3) {
            this.sendJson(res, 400, { error: 'Use /api/{category}/{tool_name}' });
            return;
        }

        let params: unknown = {};
        const body = await this.readRequestBody(req);
        if (body) {
            try {
                params = JSON.parse(body);
            } catch (error) {
                this.sendJson(res, 400, {
                    error: 'Invalid JSON in request body',
                    details: this.getErrorMessage(error)
                });
                return;
            }
        }

        const fullToolName = `${pathParts[1]}_${pathParts[2]}`;
        try {
            const result = await this.executeToolCall(fullToolName, params);
            this.sendJson(res, result.success ? 200 : 422, {
                success: result.success,
                tool: fullToolName,
                result
            });
        } catch (error) {
            const toolError = this.toToolError(error);
            this.sendJson(res, this.getToolErrorStatus(error), {
                success: false,
                tool: fullToolName,
                error: toolError.error,
                details: toolError.data
            });
        }
    }

    private readRequestBody(req: http.IncomingMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;
            let settled = false;

            req.on('data', chunk => {
                if (settled) return;
                size += chunk.length;
                if (size > this.settings.requestBodyLimitBytes) {
                    settled = true;
                    reject(new RequestBodyTooLargeError(
                        `Request body exceeds ${this.settings.requestBodyLimitBytes} bytes`
                    ));
                    req.resume();
                    return;
                }
                body += chunk.toString('utf8');
            });
            req.on('end', () => {
                if (!settled) resolve(body);
            });
            req.on('error', error => {
                if (!settled) reject(error);
            });
        });
    }

    private isAllowedHost(hostHeader: string | undefined): boolean {
        if (!hostHeader) return false;
        try {
            const hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
            return LOOPBACK_HOSTS.has(hostname);
        } catch {
            return false;
        }
    }

    private isAllowedOrigin(origin: string): boolean {
        return this.settings.allowedOrigins.some(allowed => {
            if (allowed.endsWith('*')) {
                return origin.startsWith(allowed.slice(0, -1));
            }
            return allowed === origin;
        });
    }

    private isAuthenticated(req: http.IncomingMessage): boolean {
        const authorization = this.getHeader(req.headers.authorization);
        const bearerToken = authorization?.startsWith('Bearer ')
            ? authorization.slice('Bearer '.length).trim()
            : undefined;
        const token = bearerToken ?? this.getHeader(req.headers['x-mcp-token']);
        if (!token) return false;

        const expected = Buffer.from(this.settings.authToken);
        const provided = Buffer.from(token);
        return expected.length === provided.length && timingSafeEqual(expected, provided);
    }

    private getListeningPort(): number {
        const address = this.httpServer?.address();
        return address && typeof address === 'object' ? address.port : this.settings.port;
    }

    private getSessionIdleTimeoutMs(): number {
        return Number.isFinite(this.settings.sessionIdleTimeoutMs)
            ? this.settings.sessionIdleTimeoutMs
            : 30 * 60 * 1000;
    }

    private getSimplifiedToolsList(): unknown[] {
        return this.toolsList.map(tool => {
            const underscoreIdx = tool.name.indexOf('_');
            const category = tool.name.substring(0, underscoreIdx);
            const toolName = tool.name.substring(underscoreIdx + 1);
            return {
                name: tool.name,
                category,
                toolName,
                description: tool.description,
                annotations: tool.annotations,
                apiPath: `/api/${category}/${toolName}`,
                curlExample: this.generateCurlExample(category, toolName, tool.inputSchema)
            };
        });
    }

    private generateCurlExample(category: string, toolName: string, schema: any): string {
        const sampleParams = this.generateSampleParams(schema);
        const jsonString = JSON.stringify(sampleParams, null, 2);
        return `curl -X POST http://127.0.0.1:${this.getListeningPort()}/api/${category}/${toolName} \\\n  -H "Authorization: Bearer ${this.settings.authToken}" \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonString}'`;
    }

    private generateSampleParams(schema: any): Record<string, unknown> {
        if (!schema?.properties) return {};
        const sample: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
            if (prop.const !== undefined) {
                sample[key] = prop.const;
                continue;
            }
            switch (prop.type) {
                case 'string': sample[key] = prop.default ?? 'example_string'; break;
                case 'number': sample[key] = prop.default ?? 0; break;
                case 'boolean': sample[key] = prop.default ?? true; break;
                case 'array': sample[key] = prop.default ?? []; break;
                case 'object': sample[key] = prop.default ?? {}; break;
                default: sample[key] = prop.default ?? null;
            }
        }
        return sample;
    }

    private toCallToolResult(result: ToolResponse): any {
        return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
            isError: !result.success
        };
    }

    private toToolError(error: unknown): ToolResponse {
        const response: ToolResponse = {
            success: false,
            error: this.getErrorMessage(error)
        };
        if (error instanceof ToolValidationError) {
            response.data = { validationErrors: error.details };
        }
        return response;
    }

    private getToolErrorStatus(error: unknown): number {
        if (error instanceof ToolDisabledError) return 403;
        if (error instanceof ToolConfirmationError || error instanceof ToolValidationError) return 400;
        if (error instanceof ToolTimeoutError) return 504;
        return 404;
    }

    private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
        if (!res.hasHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.writeHead(status);
        res.end(JSON.stringify(body));
    }

    private getHeader(value: string | string[] | undefined): string | undefined {
        return Array.isArray(value) ? value[0] : value;
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private debug(message: string): void {
        debugLog('MCPServer', message);
    }
}
