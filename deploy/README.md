# VPS ga deploy qilish

## 1. VPS da bir marta

```bash
# Docker o'rnatish
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# chiqib qayta kiring (exit/ssh)
```

## 2. Loyihani ko'chirish

```bash
git clone <repo-url> /home/ubuntu/restocrm
cd /home/ubuntu/restocrm
```

## 3. SSL va deploy

```bash
# Domenni VPS IP ga yo'naltirgan bo'lishingiz kerak (A record)
bash deploy/deploy.sh
```

Bu skript avtomatik:
- SSL sertifikat oladi (Let's Encrypt)
- Nginx sozlaydi
- Docker containerlarni build qiladi
- Service-larni ishga tushiradi

## 4. Bot webhook

Sayt ochilgandan keyin:
1. Owner panel → korxona → Telegram Bot Token maydoniga @BotFather dan tokenni kiriting
2. Saqlang — webhook avtomatik o'rnatiladi

## Portlar

| Service | Container port | Host port |
|---------|---------------|-----------|
| Backend | 8000 | 127.0.0.1:8001 |
| Frontend | 80 | 127.0.0.1:3002 |
| DB | 5432 | 127.0.0.1:5434 |

Nginx tashqi dunyoga 443 (HTTPS) ochadi. Qolgan portlar `127.0.0.1` ga bog'langan — tashqaridan ko'rinmaydi.
