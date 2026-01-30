#!/usr/bin/env bash
set -euo pipefail

########################################
# CONFIG – MATCHES src/server/server.js
########################################

# Your chat endpoint
CHAT_URL="http://localhost:3001/chat"

# Payload keys (change if your route uses different names)
MSG_KEY="message"
SESSION_KEY="sessionId"

# Shared session id so all tests are in one conversation
SESSION_ID="jarvis-test-suite-$(date +%s)"

# Where to store logs
LOG_DIR="./jarvis_test_logs"
mkdir -p "$LOG_DIR"

echo "Using CHAT_URL=$CHAT_URL"
echo "Using session ID=$SESSION_ID"
echo "Logs → $LOG_DIR"
echo "Make sure: npm run dev is already running in another terminal."
echo

########################################
# HELPER: SEND CHAT MESSAGE
########################################

send_chat() {
  local msg="$1"
  local label="$2"

  local outfile="$LOG_DIR/${label}.json"

  echo
  echo "===== [$label] ====="
  echo "USER: $msg"

  # Build JSON using dynamic keys
  curl -sS -X POST "$CHAT_URL" \
    -H "Content-Type: application/json" \
    -d "$(
      jq -n \
        --arg m "$msg" \
        --arg s "$SESSION_ID" \
        --arg mk "$MSG_KEY" \
        --arg sk "$SESSION_KEY" \
        '{($mk): $m, ($sk): $s}'
    )" \
    | tee "$outfile"

  echo
  echo "Response logged to: $outfile"
}

########################################
# TEST SEQUENCES
########################################

run_basic_notes_docs_tests() {
  echo
  echo "### Basic notes/docs ###"

  send_chat "Explain what execution mode and capabilities are in this system." "01_basic_explain_exec_mode"
  send_chat "save" "02_notes_save"
  send_chat "list notes" "03_notes_list"
  send_chat "open note 2026-01-30_22-10-03.md" "04_notes_open_example"
  send_chat "rename note 2026-01-30_22-10-03.md to exec-mode-notes.md" "05_notes_rename_example"
  send_chat "delete note exec-mode-notes.md" "06_notes_delete_example"

  send_chat "Give me a short guide on how to organize a programming project." "07_docs_generate"
  send_chat "save to docs" "08_docs_save"
  send_chat "list docs" "09_docs_list"
  send_chat "open doc 2026-01-30_22-18-41.md" "10_docs_open_example"
}

run_project_tests() {
  echo
  echo "### Projects ###"

  send_chat "create project jarvis" "20_proj_create_jarvis"
  send_chat "switch project jarvis" "21_proj_switch_jarvis"
  send_chat "set project description AI assistant for my local machine" "22_proj_set_desc"
  send_chat "current project" "23_proj_current"

  send_chat "Give me a TODO list for improving my Jarvis assistant." "24_proj_jarvis_todo"
  send_chat "save" "25_proj_notes_save_jarvis"
  send_chat "save to docs" "26_proj_docs_save_jarvis"
  send_chat "list notes" "27_proj_notes_list_jarvis"
  send_chat "list docs" "28_proj_docs_list_jarvis"
}

run_memory_tests() {
  echo
  echo "### Memory ###"

  send_chat "Summarize the main goals of the Jarvis project in 5 bullet points." "30_mem_summary"
  send_chat "remember this" "31_mem_remember_this"
  send_chat "list memories" "32_mem_list"
  send_chat "show memory 2026-01-30-221003" "33_mem_show_example"
  send_chat "forget memory 2026-01-30-221003" "34_mem_forget_example"
}

run_planner_tests() {
  echo
  echo "### Planner ###"

  send_chat "I want to clean up my workspace: move all notes into a notes folder, docs into a docs folder, and then summarize everything." "40_plan_goal"
  send_chat "plan" "41_plan_generate"
  send_chat "show plan" "42_plan_show"
  send_chat "plan status" "43_plan_status"
  send_chat "check plan readiness" "44_plan_readiness"
  send_chat "plan history" "45_plan_history"
}

run_execution_and_capability_tests() {
  echo
  echo "### Execution & capabilities ###"

  send_chat "list capabilities" "50_caps_list_initial"
  send_chat "set execution mode manual" "51_exec_mode_manual"
  send_chat "enable capability read_file" "52_enable_read_file"
  send_chat "use execution profile editor" "53_use_profile_editor"

  send_chat "create project sandbox" "54_proj_create_sandbox"
  send_chat "switch project sandbox" "55_proj_switch_sandbox"

  send_chat "I want a notes.md file that contains a checklist for my day." "56_plan_notes_file_goal"
  send_chat "plan" "57_plan_notes_file_generate"
  send_chat "show plan" "58_plan_notes_file_show"

  send_chat "dry run step 1" "59_dry_run_step_1"
  send_chat "execute step 1" "60_execute_step_1"
  send_chat "allow step 1" "61_allow_step_1"
  send_chat "plan status" "62_plan_status_after_step"

  send_chat "Help me refactor my workspace: rename notes.md to daily-notes.md and move it to a notes/ folder." "63_plan_organize_goal"
  send_chat "plan" "64_plan_organize_generate"
  send_chat "show plan" "65_plan_organize_show"
  send_chat "enable capability organize_files" "66_enable_organize"
  send_chat "dry run step 1" "67_dry_run_organize_step_1"
  send_chat "execute step 1" "68_execute_organize_step_1"
  send_chat "allow step 1" "69_allow_organize_step_1"
  send_chat "undo step 1" "70_undo_organize_step_1"
}

run_safety_and_mode_tests() {
  echo
  echo "### Safety / execution mode ###"

  send_chat "set execution mode disabled" "80_exec_mode_disabled"
  send_chat "execute step 1" "81_execute_step_when_disabled"
  send_chat "set execution mode manual" "82_exec_mode_manual_again"

  send_chat "execute step 1" "83_execute_step_permission_round_1"
  send_chat "deny step 1" "84_deny_step_1"
  send_chat "execute step 1" "85_execute_step_permission_round_2"
}

run_plan_persistence_tests() {
  echo
  echo "### Plan persistence ###"

  send_chat "save plan" "90_save_plan"
  send_chat "list plans" "91_list_plans"
  send_chat "export plan" "92_export_plan"
  send_chat "save plan as template" "93_save_plan_template"
  send_chat "list plan templates" "94_list_plan_templates"
}

run_session_tests() {
  echo
  echo "### Session snapshots ###"

  send_chat "save session" "100_save_session"
  send_chat "list sessions" "101_list_sessions"
}

run_help_and_status_tests() {
  echo
  echo "### Help & status ###"

  send_chat "help" "110_help"
  send_chat "help commands" "111_help_commands"
  send_chat "help execution" "112_help_execution"
  send_chat "plan status" "113_plan_status_final"
  send_chat "plan changes" "114_plan_changes"
  send_chat "list capabilities" "115_caps_list_final"
  send_chat "show execution mode" "116_show_execution_mode"
  send_chat "list execution profiles" "117_list_exec_profiles"
  send_chat "current execution profile" "118_current_exec_profile"
}

########################################
# MAIN
########################################

main() {
  echo "Assuming ChatDock server is already running at: $CHAT_URL"
  echo

  run_basic_notes_docs_tests
  run_project_tests
  run_memory_tests
  run_planner_tests
  run_execution_and_capability_tests
  run_safety_and_mode_tests
  run_plan_persistence_tests
  run_session_tests
  run_help_and_status_tests

  echo
  echo "All test commands sent. Logs are in: $LOG_DIR"
}

main