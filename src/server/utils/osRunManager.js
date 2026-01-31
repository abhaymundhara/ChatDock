const crypto = require('node:crypto');

class OSRunManager {
    constructor(maxHistory = 50) {
        this.runs = [];
        this.maxHistory = maxHistory;
    }

    /**
     * Creates a new run entry.
     */
    startRun(command, triggeredBy = 'direct') {
        const run = {
            id: crypto.randomUUID(),
            timestampStarted: new Date().toISOString(),
            timestampFinished: null,
            command,
            status: 'running',
            stdout: '',
            stderr: '',
            triggeredBy
        };

        this.runs.unshift(run);

        if (this.runs.length > this.maxHistory) {
            this.runs.pop();
        }

        return run.id;
    }

    /**
     * Appends output to a run.
     */
    appendOutput(id, stdout, stderr) {
        const run = this.runs.find(r => r.id === id);
        if (run) {
            if (stdout) run.stdout += stdout;
            if (stderr) run.stderr += stderr;
        }
    }

    /**
     * Finalizes a run.
     */
    finishRun(id, success) {
        const run = this.runs.find(r => r.id === id);
        if (run) {
            run.timestampFinished = new Date().toISOString();
            run.status = success ? 'success' : 'error';
        }
    }

    /**
     * Returns all runs.
     */
    getRuns() {
        return this.runs;
    }

    /**
     * Returns a specific run.
     */
    getRun(id) {
        return this.runs.find(r => r.id === id);
    }
}

// Singleton instance
const osRunManager = new OSRunManager();

module.exports = osRunManager;
