# Start with the official Node.js 18 image (Debian-based)
FROM node:18-bullseye-slim

# Install compilation dependencies: Python3, GCC/G++ (for C/C++), and OpenJDK 17 (for Java)
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory for the application
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the server code
COPY server.js ./

# Expose port 8080 (the default for Google Cloud Run)
EXPOSE 8080

# Start the Node.js server
CMD ["npm", "start"]
