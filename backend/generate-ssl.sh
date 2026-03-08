#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate self-signed certificate for development
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/C=EE/ST=Harjumaa/L=Tallinn/O=Wellness/CN=localhost"

echo "✓ Self-signed SSL certificates generated in certs/"
