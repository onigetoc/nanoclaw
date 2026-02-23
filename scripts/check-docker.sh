#!/bin/bash
# Docker detection script for EureClaw

echo "=== Docker Capability Detection ==="
echo ""

# Check Docker CLI
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version 2>/dev/null | cut -d' ' -f3 | cut -d',' -f1)
    echo "[OK] Docker CLI installed: v$DOCKER_VERSION"
else
    echo "[SKIP] Docker CLI not found"
    exit 0
fi

# Check Docker daemon
if docker info &> /dev/null; then
    echo "[OK] Docker daemon is running"
    
    # Check for GPU support
    if docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi &> /dev/null; then
        echo "[OK] GPU passthrough available"
    else
        echo "[WARN] No GPU passthrough (containers will run on CPU)"
    fi
else
    echo "[FAIL] Docker daemon is NOT running"
    echo ""
    echo "To fix:"
    echo "  - Install Docker Desktop and start it"
    echo "  - Or use WSL2 backend: wsl --install"
fi
