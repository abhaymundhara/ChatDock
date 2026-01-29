/**
 * File Specialist for ChatDock
 * Handles file operations with fresh context and read-before-write enforcement
 * Based on Anthropic Cowork patterns
 */

const fs = require("node:fs");
const path = require("node:path");
const { OllamaClient } = require("../ollama-client");

/**
 * Load the File Specialist system prompt
 * @returns {string}
 */
function loadFileSpecialistPrompt() {
    const appPath =
        process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../../..");
    const promptPath = path.join(appPath, "brain", "agents", "FILE_SPECIALIST.md");

    if (!fs.existsSync(promptPath)) {
        throw new Error(`FILE_SPECIALIST.md not found at ${promptPath}`);
    }

    return fs.readFileSync(promptPath, "utf-8");
}

/**
 * File Specialist class
 * Provides file operations with read-before-write enforcement
 */
class FileSpecialist {
    constructor(options = {}) {
        this.ollamaClient = options.ollamaClient || new OllamaClient();
        this.model = options.model;
        this.systemPrompt = null;

        // Read-before-write tracker - tracks files read in this session
        this.readFiles = new Set();
    }

    /**
     * Get the system prompt (cached)
     * @returns {string}
     */
    getSystemPrompt() {
        if (!this.systemPrompt) {
            this.systemPrompt = loadFileSpecialistPrompt();
        }
        return this.systemPrompt;
    }

    /**
     * Track a file as read
     * @param {string} filePath - Absolute path to file
     */
    trackRead(filePath) {
        const normalizedPath = path.resolve(filePath);
        this.readFiles.add(normalizedPath);
        console.log(`[file-specialist] Tracked read: ${normalizedPath}`);
    }

    /**
     * Check if a file has been read
     * @param {string} filePath - Absolute path to file
     * @returns {boolean}
     */
    hasRead(filePath) {
        const normalizedPath = path.resolve(filePath);
        return this.readFiles.has(normalizedPath);
    }

    /**
     * Validate write operation - enforce read-before-write
     * @param {string} filePath - Absolute path to file
     * @returns {{valid: boolean, error?: string}}
     */
    validateWrite(filePath) {
        const normalizedPath = path.resolve(filePath);

        // If file doesn't exist, write is allowed (creating new file)
        if (!fs.existsSync(normalizedPath)) {
            return { valid: true };
        }

        // If file exists, it must have been read first
        if (!this.hasRead(normalizedPath)) {
            return {
                valid: false,
                error: `Must read file before modifying it: ${normalizedPath}`,
            };
        }

        return { valid: true };
    }

    /**
     * Reset the read tracker (for new task)
     */
    resetTracker() {
        this.readFiles.clear();
        console.log("[file-specialist] Read tracker reset");
    }

    /**
     * Create a context object for tool execution
     * @returns {Object}
     */
    createToolContext() {
        return {
            readFiles: this.readFiles,
            trackRead: this.trackRead.bind(this),
            hasRead: this.hasRead.bind(this),
            validateWrite: this.validateWrite.bind(this),
        };
    }

    /**
     * Execute a file task
     * @param {Object} task - { id, title, description }
     * @param {Object} options
     * @returns {Promise<{success: boolean, result?: any, error?: string}>}
     */
    async execute(task, options = {}) {
        const model = options.model || this.model;

        console.log(`[file-specialist] Executing task: ${task.id}`);

        // Reset tracker for fresh context
        this.resetTracker();

        try {
            const systemPrompt = this.getSystemPrompt();

            // Build fresh context message - ONLY task description
            const taskMessage = `Task: ${task.title}\n\nDescription: ${task.description}`;

            // Get file tools
            const registry = require("../../tools/registry");
            const tools = await registry.getToolsByCategory("fs");

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: taskMessage },
            ];

            // Call LLM with tools
            const response = await this.ollamaClient.chatWithTools(messages, tools, {
                model,
                temperature: 0.5,
            });

            // Execute tool calls if present
            if (response.tool_calls && response.tool_calls.length > 0) {
                const toolResults = await this.executeToolCalls(response.tool_calls);

                return {
                    success: true,
                    result: {
                        content: response.content,
                        tool_calls: response.tool_calls,
                        tool_results: toolResults,
                        read_files: Array.from(this.readFiles),
                    },
                };
            }

            return {
                success: true,
                result: {
                    content: response.content || "",
                    model: response.model,
                    read_files: Array.from(this.readFiles),
                },
            };
        } catch (error) {
            console.error(`[file-specialist] Task failed:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * Execute tool calls with read-before-write enforcement
     * @param {Array} toolCalls
     * @returns {Promise<Array>}
     */
    async executeToolCalls(toolCalls) {
        const registry = require("../../tools/registry");
        const results = [];

        for (const toolCall of toolCalls) {
            const toolName = toolCall.function?.name;
            const toolArgs = toolCall.function?.arguments;

            if (!toolName) {
                results.push({ error: "Tool call missing function name" });
                continue;
            }

            try {
                // Parse arguments
                const args =
                    typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs || {};

                // Inject context for read-before-write tracking
                args.__context = this.createToolContext();

                // Execute tool
                const result = await registry.executeTool(toolName, args);

                // Track reads for read_file tool
                if (toolName === "read_file" && result.success && args.path) {
                    this.trackRead(args.path);
                }

                results.push(result);
            } catch (error) {
                results.push({ error: error.message });
            }
        }

        return results;
    }
}

module.exports = {
    FileSpecialist,
    loadFileSpecialistPrompt,
};
