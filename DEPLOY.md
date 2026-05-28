# Ubuntu 24.04 Serverga deploy qo'llanma

## Talablar

- Ubuntu 24.04 LTS
- Domain nomi (masalan, `resca.uz`)
- 80 va 443 portlar ochiq

---

## 1. Serverni tayyorlash

```bash
ssh user@server-ip

sudo apt update && sudo apt upgrade -y

sudo apt install -y git curl nginx certbot python3-certbot-nginx

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Loyihani yuklash

```bash
cd /opt
sudo git clone <repo-url> restocrm
sudo chown -R $USER:$USER restocrm
cd restocrm
```

## 3. Muhit sozlamalari

```bash
cat > backend/.env << 'EOF'
DATABASE_URL=postgresql+psycopg://restouser:restopass@db:5432/restocrm
JWT_SECRET=$(openssl rand -hex 32)
JWT_ALG=HS256
JWT_EXPIRES_MINUTES=10080
CORS_ORIGINS=https://resca.uz
EOF
```

## 4. PostgreSQL va backendni ishga tushirish

```bash
docker compose up -d db
sleep 5
docker compose up -d backend
docker compose logs -f backend
```

Kutib turing, `Backend ishga tushdi` degan yozuv chiqishi kerak. Chiqish uchun `Ctrl+C`.

## 5. Frontendni ishga tushirish

```bash
docker compose up -d frontend
docker compose ps
```

Barcha containerlar `Up` holatida bo'lishi kerak.

## 6. Nginx sozlash

```bash
sudo tee /etc/nginx/sites-available/resca.uz << 'NGINX'
server {
    listen 80;
    server_name resca.uz;

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/resca.uz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 7. SSL sertifikat

```bash
sudo certbot --nginx -d resca.uz -d www.resca.uz
sudo certbot renew --dry-run
```

## 8. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 9. Yangi versiya chiqarish

```bash
cd /opt/restocrm
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

## 10. Backup

```bash
docker compose exec db pg_dump -U restouser restocrm > /opt/restocrm/dump-$(date +%Y%m%d).sql

# Cron
crontab -e
# 0 3 * * * docker compose -f /opt/restocrm/docker-compose.yml exec -T db pg_dump -U restouser restocrm > /opt/restocrm/dump-$(date +\%Y\%m\%d).sql
```

## 11. Xizmatlar

| Xizmat    | URL                              |
|-----------|----------------------------------|
| Frontend  | https://resca.uz                 |
| Backend   | https://resca.uz/api/docs        |
| PostgreSQL| localhost:5432 (ichki tarmoq)    |

## 12. Muammolar

**Backend ishga tushmayapti:**
```bash
docker compose logs backend
docker compose logs db
```

**Frontend backendga ulana olmayapti:**
```bash
sudo nginx -t
curl http://127.0.0.1:8000/api/public/venues
```

**Port band:**
```bash
sudo lsof -i :80
sudo lsof -i :443
```
