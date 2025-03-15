#!/bin/bash
set -e
 
echo "Deployment started..."

echo "Pull latest changes from main branch..."
git pull origin main
 
echo "Installing Dependencies..."
npm install --yes

echo "Restarting Passenger..."
touch tmp/restart.txt || { echo "Error: Failed to restart Passenger"; exit 1; }
 
echo "Deployment Completed Successfully!"