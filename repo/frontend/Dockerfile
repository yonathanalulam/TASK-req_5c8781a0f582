FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_HOST=backend BACKEND_PORT=4000
EXPOSE 80
# nginx:1.27-alpine entrypoint expands templates from /etc/nginx/templates via envsubst.
CMD ["nginx", "-g", "daemon off;"]
