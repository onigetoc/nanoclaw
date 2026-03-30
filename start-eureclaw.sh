#!/bin/bash
# Start EureClaw and open Web UI (macOS / Linux)

echo "Starting EureClaw..."

# Start the backend in background
bun start &
SERVER_PID=$!

# Wait for the API server to be ready
echo "Waiting for backend server..."
while ! curl -s http://127.0.0.1:4300/health >/dev/null 2>&1; do
  sleep 2
done
echo "Backend ready!"

# Start the Web UI dev server in background
echo "Starting Web UI..."
cd web-ui && bun run dev &
UI_PID=$!
cd ..

# Wait for the Web UI to be ready
while ! curl -s http://localhost:8174/ >/dev/null 2>&1; do
  sleep 2
done

# Open the Web UI in default browser
echo "Web UI ready! Opening browser..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  open http://localhost:8174
else
  xdg-open http://localhost:8174 2>/dev/null || echo "Open http://localhost:8174 in your browser"
fi

# Keep script alive, cleanup on Ctrl+C
trap "kill $SERVER_PID $UI_PID 2>/dev/null; exit" INT TERM
wait $SERVER_PID
