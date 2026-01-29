#!/usr/bin/env node
/**
 * Test script for Planner + Coordinator integration
 * Run with: node test-agent.js
 */

// Set up environment
process.env.CHATDOCK_APP_PATH = __dirname;

const { Planner } = require("./src/server/orchestrator/planner");
const { Coordinator } = require("./src/server/orchestrator/coordinator");
const {
  ConversationHandler,
} = require("./src/server/orchestrator/conversation-handler");

async function testAgent(userMessage, model = "qwen2.5:7b") {
  console.log("\n" + "=".repeat(80));
  console.log(`Testing: "${userMessage}"`);
  console.log("=".repeat(80) + "\n");

  const history = [{ role: "user", content: userMessage }];

  try {
    // Step 1: Planner
    console.log("[1] Planner analyzing intent...");
    const planner = new Planner({ model });
    const plan = await planner.plan(history, { model });

    console.log(`[1] Planner result: ${plan.type}`);
    if (plan.tool_calls && plan.tool_calls.length > 0) {
      console.log(
        `[1] Tool calls:`,
        plan.tool_calls.map((tc) => tc.function?.name),
      );
    }

    // Step 2: Coordinator
    console.log("\n[2] Coordinator executing plan...");
    const coordinator = new Coordinator({ model });

    let result;
    if (plan.type === "conversation") {
      const conversationHandler = new ConversationHandler({ model });
      const response = await conversationHandler.handleConversation(history);
      result = {
        type: "conversation",
        content: response.content,
      };
    } else {
      result = await coordinator.execute(plan, { model });
    }

    console.log(`[2] Coordinator result: ${result.type}\n`);

    // Step 3: Display result
    console.log("─".repeat(80));
    console.log("RESPONSE:");
    console.log("─".repeat(80));
    console.log(result.content);
    console.log("─".repeat(80));

    if (result.results) {
      console.log("\nTask Results:");
      result.results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.taskId}: ${r.success ? "✓" : "✗"}`);
        if (!r.success) console.log(`     Error: ${r.error}`);
      });
    }

    if (result.summary) {
      console.log("\nSummary:", result.summary);
    }

    if (result.question) {
      console.log("\nClarification Needed:");
      console.log(`  Q: ${result.question}`);
      console.log("  Options:");
      result.options.forEach((opt, i) => {
        console.log(`    ${i + 1}. ${opt.label}: ${opt.description}`);
      });
    }

    return result;
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run tests
async function main() {
  const model = process.env.TEST_MODEL || "qwen2.5:7b";

  console.log("ChatDock Agent Architecture Test");
  console.log(`Model: ${model}\n`);

  try {
    // Test 1: Conversational
    await testAgent("Hello! How are you today?", model);

    // Test 2: Simple task
    await testAgent("Find all JavaScript files in the src directory", model);

    // Test 3: Clarification
    // await testAgent('Create a report', model);

    console.log("\n✅ All tests completed\n");
  } catch (error) {
    console.error("\n❌ Tests failed");
    process.exit(1);
  }
}

// Parse command line args
if (process.argv[2]) {
  testAgent(process.argv.slice(2).join(" "))
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  main()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
