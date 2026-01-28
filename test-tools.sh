#!/bin/bash
# Test script for ChatDock tools

echo "=== ChatDock Tool Testing ==="
echo

# 1. Create test file
echo "1. Creating test file willo.txt..."
echo "test content" > ~/Desktop/willo.txt
ls -la ~/Desktop/willo.txt
echo

# 2. Restart server
echo "2. Killing existing server..."
pkill -f "node.*server.js" || true
sleep 1
echo

echo "3. Starting server..."
cd /Users/mac/ChatDock
node src/server/server.js > /tmp/chatdock-test.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 3
echo

# 3. Test the move command
echo "4. Testing move command..."
curl -X POST http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "move willo.txt from Desktop to Documents", "model": "llama3.2:3b"}' \
  2>&1
echo
echo

# 4. Check if file moved
echo "5. Checking if file moved..."
if [ -f ~/Documents/willo.txt ]; then
    echo "✓ SUCCESS: File moved to Documents"
    ls -la ~/Documents/willo.txt
else
    echo "✗ FAILED: File not found in Documents"
    echo "Checking Desktop..."
    ls -la ~/Desktop/willo.txt 2>&1 || echo "File not on Desktop either"
fi
echo

# 5. Show server logs
echo "6. Server logs:"
tail -30 /tmp/chatdock-test.log
echo

# Cleanup
echo "7. Cleanup..."
rm -f ~/Documents/willo.txt ~/Desktop/willo.txt
kill $SERVER_PID 2>/dev/null || true
echo "Done!"
