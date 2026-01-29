/**
 * Conversation Specialist for ChatDock
 * Handles pure conversational interactions
 * Based on Anthropic Cowork patterns
 */

const fs = require("node:fs");
const path = require("node:path");
const { OllamaClient } = require("../ollama-client");

/**
 * Load the Conversation Specialist system prompt
 * @returns {string}
 */
function loadConversationSpecialistPrompt() {
    const appPath =
        process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../../..");
    const promptPath = path.join(appPath, "brain", "agents", "CONVERSATION_SPECIALIST.md");

    if (!fs.existsSync(promptPath)) {
        throw new Error(`CONVERSATION_SPECIALIST.md not found at ${promptPath}`);
    }

    return fs.readFileSync(promptPath, "utf-8");
}

/**
 * Load the SOUL.md file
 * @returns {string}
 */
function loadSoul() {
    try {
        const appPath =
            process.env.CHATDOCK_APP_PATH || path.join(__dirname, "../../../..");
        const soulPath = path.join(appPath, "brain", "SOUL.md");

        if (fs.existsSync(soulPath)) {
            return fs.readFileSync(soulPath, "utf-8");
        }
        return "";
    } catch (e) {
        console.warn(`[conversation-specialist] Could not load SOUL.md: ${e.message}`);
        return "";
    }
}

/**
 * Conversation Specialist class
 * Handles chat interactions, tone, and persona management
 */
class ConversationSpecialist {
    constructor(options = {}) {
        this.ollamaClient = options.ollamaClient || new OllamaClient();
        this.model = options.model;
        this.systemPrompt = null;
    }

    /**
     * Get the system prompt (cached)
     * Includes SOUL.md context
     * @returns {string}
     */
    getSystemPrompt() {
        if (!this.systemPrompt) {
            const basePrompt = loadConversationSpecialistPrompt();
            const soulContent = loadSoul();
            
            if (soulContent) {
                this.systemPrompt = `${basePrompt}\n\n# CORE PERSONALITY (SOUL)\n\n${soulContent}`;
            } else {
                this.systemPrompt = basePrompt;
            }
        }
        return this.systemPrompt;
    }

    /**
     * Execute a conversation task
     * @param {Object} task - { id, title, description }
     * @param {Object} options
     * @returns {Promise<{success: boolean, result?: any, error?: string}>}
     */
    async execute(task, options = {}) {
        const model = options.model || this.model;
        
        console.log(`[conversation-specialist] Executing task: ${task.id}`);

        try {
            const systemPrompt = this.getSystemPrompt();

            // Build fresh context message
            const taskMessage = `Task: ${task.title}\n\n${task.description}`;

            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: taskMessage },
            ];

            // Conversations don't use tools
            const response = await this.ollamaClient.chat(messages, {
                model,
                temperature: 0.7, // Slightly creative for conversation
            });

            return {
                success: true,
                result: {
                    content: response.content || "",
                    model: response.model,
                },
            };
        } catch (error) {
            console.error(`[conversation-specialist] Task failed:`, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

module.exports = {
    ConversationSpecialist,
    loadConversationSpecialistPrompt,
};
