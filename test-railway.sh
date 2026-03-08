#!/bin/bash

# Test Railway Backend and Frontend

echo "🧪 Testing Railway Deployment"
echo "================================"
echo ""

# Get URLs from user
read -p "Enter your BACKEND URL (e.g., https://...backend...railway.app): " BACKEND_URL
read -p "Enter your FRONTEND URL (e.g., https://...frontend...railway.app): " FRONTEND_URL

echo ""
echo "Testing Backend Health..."
echo "------------------------"
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BACKEND_URL/health"

echo ""
echo "Testing Frontend..."
echo "-------------------"
curl -s -o /dev/null -w "Status: %{http_code}\n" "$FRONTEND_URL"

echo ""
echo "Testing Backend API Registration endpoint..."
echo "--------------------------------------------"
curl -s -X POST "$BACKEND_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}' \
  | head -c 200

echo ""
echo ""
echo "✅ If you see status 200 for health and frontend, it's working!"
echo "⚠️  If you see 404 or 500, check the logs in Railway dashboard."
