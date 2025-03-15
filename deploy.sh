#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

LOG_FILE="deployment.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=============================="
echo "Deployment started at $(date)"
echo "=============================="


echo "Pulling latest changes from main branch..."
git pull origin main || { echo "Error: Git pull failed"; exit 1; }

echo "Installing dependencies..."
npm install --yes || { echo "Error: Dependency installation failed"; exit 1; }


echo "Restarting Passenger..."
touch tmp/restart.txt || { echo "Error: Failed to restart Passenger"; exit 1; }

echo "Deployment completed successfully at $(date)"
