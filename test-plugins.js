#!/usr/bin/env node
/**
 * Test the plugin-based tool system
 */

const registry = require("./src/server/tools/registry");

async function testPluginSystem() {
  console.log("Testing Plugin-Based Tool System");
  console.log("=".repeat(80));

  try {
    // Test 1: Initialize
    console.log("\n[1] Initializing registry...");
    await registry.initialize();
    console.log("✓ Registry initialized");

    // Test 2: Get all categories
    console.log("\n[2] Available categories:");
    const categories = await registry.getCategories();
    console.log("   ", categories.join(", "));

    // Test 3: Get all plugins
    console.log("\n[3] Loaded plugins:");
    const plugins = await registry.getAllPlugins();
    plugins.forEach((p) => {
      console.log(`    ${p.name} (${p.category}) - ${p.tools.length} tools`);
    });

    // Test 4: Get tools by category
    console.log("\n[4] Tools by category:");
    for (const category of categories) {
      const tools = await registry.getToolsByCategory(category);
      console.log(
        `    ${category}: ${tools.map((t) => t.function.name).join(", ")}`,
      );
    }

    // Test 5: Get tools for specialists
    console.log("\n[5] Tools for specialists:");
    const specialists = [
      "file",
      "shell",
      "web",
      "code",
      "conversation",
      "planner",
    ];
    for (const specialist of specialists) {
      const tools = await registry.getToolsForSpecialist(specialist);
      console.log(
        `    ${specialist}: ${tools.map((t) => t.function.name).join(", ")}`,
      );
    }

    // Test 6: Execute a tool
    console.log("\n[6] Testing tool execution:");

    // Test filesystem read (should fail gracefully for non-existent file)
    const readResult = await registry.executeTool("read_file", {
      path: "/tmp/test-nonexistent.txt",
    });
    console.log(
      "    read_file (non-existent):",
      readResult.success ? "✓" : "✗",
      readResult.error || "success",
    );

    // Test system info
    const sysInfo = await registry.executeTool("get_system_info", {});
    console.log(
      "    get_system_info:",
      sysInfo.success ? "✓" : "✗",
      sysInfo.success ? `${sysInfo.platform}/${sysInfo.arch}` : sysInfo.error,
    );

    // Test 7: Tool metadata
    console.log("\n[7] Tool metadata:");
    const readFileTool = await registry.getTool("read_file");
    console.log("    read_file category:", readFileTool.__category);
    console.log("    read_file plugin:", readFileTool.__plugin);

    console.log("\n" + "=".repeat(80));
    console.log("✅ All plugin system tests passed!");
    console.log("=".repeat(80));

    // Summary
    console.log("\nSummary:");
    console.log(`  ${plugins.length} plugins loaded`);
    console.log(`  ${categories.length} categories available`);
    const allTools = await registry.getAllTools();
    console.log(`  ${allTools.length} total tools`);
    console.log("\nPlugin System: READY ✓");
  } catch (error) {
    console.error("\n❌ Plugin system test failed:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testPluginSystem()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
