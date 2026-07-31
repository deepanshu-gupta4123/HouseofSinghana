FROM node:20-alpine
WORKDIR /app
COPY . .
WORKDIR /app/server
RUN npm install --production
EXPOSE 3000
CMD ["npm", "start"]
