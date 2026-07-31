#!/bin/bash
# A simple deployment script to build and run the Docker container on a Linux VPS

echo "Building Docker Image..."
docker build -t house-of-singhana .

echo "Stopping old container (if exists)..."
docker stop house-of-singhana-app || true
docker rm house-of-singhana-app || true

echo "Starting new container on port 3000..."
docker run -d --restart unless-stopped --name house-of-singhana-app -p 3000:3000 --env-file .env house-of-singhana

echo "Deployment complete! App is running on localhost:3000"
