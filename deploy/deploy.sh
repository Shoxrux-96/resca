#!/usr/bin/env bash
set -euo pipefail

echo "=== RestoCRM Production Deploy ==="

# 1. SSL certificate
if [ ! -d "/etc/letsencrypt/live/resca.uz" ]; then
  echo ">>> SSL o'rnatilmoqda..."
  sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
  sudo certbot --nginx -d resca.uz -d www.resca.uz --non-interactive --agree-tos -m admin@resca.uz
fi

# 2. Nginx config
echo ">>> Nginx sozlanmoqda..."
sudo cp deploy/nginx-resca.uz.conf /etc/nginx/sites-available/resca.uz
sudo ln -sf /etc/nginx/sites-available/resca.uz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 3. Build and start containers
echo ">>> Docker containerlar qurilmoqda..."
sudo docker compose -f docker-compose.prod.yml build
sudo docker compose -f docker-compose.prod.yml up -d

# 4. Health check
echo ">>> Tekshirilmoqda..."
sleep 5
curl -s -o /dev/null -w "Backend: %{http_code}\n" https://resca.uz/api/venues/1/telegram/webhook-info || echo "Backend: not ready"
curl -s -o /dev/null -w "Frontend: %{http_code}\n" https://resca.uz || echo "Frontend: not ready"

echo "=== Deploy tugadi ==="
echo "Frontend: https://resca.uz"
echo "Backend:  https://resca.uz/api"
