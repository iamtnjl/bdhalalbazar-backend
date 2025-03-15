#!/bin/bash
set -e
 
echo "Deployment started..."

echo "Pull latest changes from main branch..."
git pull origin main
 
echo "Installing Dependencies..."
npm install --yes
 
echo "Deployment Completed Successfully!"