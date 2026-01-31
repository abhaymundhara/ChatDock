const { getProfiles, getGlobalExecutionMode, getAllCapabilities } = require("../capabilities/capabilityRegistry");

function handleHelpCommands(userMsg, state) {
  const normalizedMsg = userMsg.trim().toLowerCase();

  // 1. Help / Help Commands
  if (normalizedMsg === "help" || normalizedMsg === "help commands") {
    const response = `**Available Commands:**

**Notes & Docs**
- **Save:** \`save note\`, \`save doc\` (saves last response)
- **Manage:** \`list notes\`, \`list docs\`
- **View:** \`open note <name>\`, \`open doc <name>\`
- **Edit:** \`rename note <old> to <new>\`
- **Delete:** \`delete note <name>\`, \`delete doc <name>\`

**Projects**
- **Manage:** \`create project <name>\`, \`list projects\`, \`delete project <name>\`
- **Context:** \`switch project <name>\`, \`current project\`
- **Info:** \`set project description <text>\`

**Memory**
- **Save:** \`remember this\` (saves last response)
- **Find:** \`search memories <query>\`, \`recall <query>\`
- **Manage:** \`list memories\`, \`show memory <id>\`, \`forget memory <id>\`
- **Auto:** \`auto memory on\`, \`auto memory off\`, \`memory status\`
- **Config:** \`memory config\`, \`set memory <key> <value>\`, \`reset memory config\`

**Planning & Execution**
- **Plan:** \`plan <goal>\`, \`show plan\`, \`cancel plan\`
- **Execution:** \`proceed with plan\`, \`execute step <n>\`, \`plan status\`
- **Review:** \`check plan readiness\`
- **Edits:** \`apply edit <n>\`, \`apply organize <n>\`
- **Skills:** \`list skills\`, \`install skill <path>\`, \`remove skill <name>\`
- **Stats:** \`plan stats\`

**Channels**
- **Sessions:** \`list channels\`, \`register channel <channel> <userId>\`, \`remove channel <channel> <userId>\`

**Safety & Profiles**
- **Profiles:** \`list execution profiles\`, \`use execution profile <name>\`
- **Controls:** \`show execution mode\`, \`set execution mode <manual/disabled>\`
- **Capabilities:** \`list capabilities\`, \`enable/disable capability <name>\`
- **Details:** \`help execution\` (for more on safety/modes)

**General**
- **Reset:** \`exit\`, \`stop\`, \`no thanks\`
`;
    return { handled: true, response };
  }

  // 2. Help Execution
  if (normalizedMsg === "help execution") {
    const { active } = getProfiles();
    const mode = getGlobalExecutionMode();

    const response = `**Execution System Guide:**

**1. Execution Modes**
- **Manual (Default):** Steps require explicit approval. You must say \`execute step <n>\` for every action.
- **Disabled:** No steps can be executed.
- *Current Mode:* **${mode}**

**2. Capabilities**
- Define what the agent can actually do (e.g., \`read_file\`, \`write_file\`).
- If a capability is disabled, the step cannot be executed even in Manual mode.
- Check enable/disable status with \`list capabilities\`.

**3. Execution Profiles**
- Quick safety presets.
- **Safe:** All caps disabled, Manual mode.
- **Editor:** Read/Write/Edit enabled.
- **Organizer:** Read/Organize enabled.
- *Current Profile:* **${active}**

**4. Plan Execution Flow**
1. **Plan:** Agent proposes a plan.
2. **Review:** You say \`proceed with plan\`.
3. **Execute:** You say \`execute step <n>\`.
4. **Approve:** If a sensitive action (like writing code), the system asks for final permission (\`allow step <n>\` or \`deny step <n>\`).
`;

    return { handled: true, response };
  }

  // 3. List Capabilities
  if (normalizedMsg === "list capabilities") {
    const caps = getAllCapabilities();
    const lines = ["**System Capabilities:**\n"];
    for (const [key, val] of Object.entries(caps)) {
        if (key === "unknown") continue;
        const status = val.enabled ? "✅ Enabled" : "❌ Disabled";
        lines.push(`- **${key}**: ${val.description} (${status})`);
    }
    lines.push("\nUse `enable/disable capability <name>` to change.");
    return { handled: true, response: lines.join("\n") };
  }

  return { handled: false };
}

module.exports = { handleHelpCommands };
