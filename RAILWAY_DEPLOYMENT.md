# Railway Deployment Guide / Paigaldamise Juhend

## 🚂 Projekti Seadistamine Railway'l

See projekt on **monorepo** struktuuriga - backend ja frontend on eraldi teenused. Railway's tuleb seadistada 3 teenust:

### 1️⃣ PostgreSQL Andmebaas

**Railway dashboardis:**
1. Mine oma projekti
2. Vajuta "New Service" → "Database" → "PostgreSQL"
3. Andmebaas luuakse automaatselt
4. Railway annab automaatselt `DATABASE_URL` keskkonnamuutuja

**✅ See on juba olemas (postgres-volume)**

---

### 2️⃣ Backend Teenus

**Railway dashboardis:**
1. Vajuta "New Service" → "GitHub Repo" → vali `numbers-dont-lie` repo
2. **TÄHTIS:** Vali `railway` haru (branch)
3. **Settings → Service:**
   - **Root Directory:** `backend`
   - **Watch Paths:** `/backend/**`

4. **Settings → Environment Variables:**
   ```bash
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_ACCESS_SECRET=your-random-secret-min-32-chars
   JWT_REFRESH_SECRET=your-random-secret-min-32-chars
   ENCRYPTION_KEY=your-random-32-char-encryption-key
   NODE_ENV=production
   PORT=3000
   
   # Frontend URL (muuda pärast frontend deploydi)
   FRONTEND_URL=${{Frontend.RAILWAY_PUBLIC_DOMAIN}}
   
   # OAuth (valikuline)
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_CALLBACK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}/auth/google/callback
   
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   GITHUB_CALLBACK_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}/auth/github/callback
   
   # Email (valikuline, nodemailer jaoks)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   EMAIL_FROM=noreply@yourdomain.com
   
   # OpenAI (AI insights'i jaoks)
   OPENAI_API_KEY=sk-...your-openai-key
   ```

5. **Settings → Networking:**
   - **Public Networking:** ENABLED
   - Kopeeri Public Domain URL

6. Deploy peaks automaatselt käivituma

---

### 3️⃣ Frontend Teenus

**Railway dashboardis:**
1. Vajuta "New Service" → "GitHub Repo" → vali `numbers-dont-lie` repo
2. **TÄHTIS:** Vali `railway` haru (branch)
3. **Settings → Service:**
   - **Root Directory:** `frontend`
   - **Watch Paths:** `/frontend/**`

4. **Settings → Environment Variables:**
   ```bash
   VITE_API_URL=https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}
   PORT=5173
   ```

5. **Settings → Networking:**
   - **Public Networking:** ENABLED

6. Deploy peaks automaatselt käivituma

---

## 📋 Kontrollimisnimekiri (Checklist)

### Enne deployimist:
- [x] `railway` haru on olemas ja ajakohane
- [x] `backend/railway.json` on seadistatud
- [x] `frontend/railway.json` on seadistatud
- [ ] Kõik keskkonna muutujad on seadistatud
- [ ] PostgreSQL andmebaas on loodud

### Pärast deployimist:
- [ ] Backend build õnnestus
- [ ] Frontend build õnnestus
- [ ] Database migratsioonid käivitusid
- [ ] Backend on kättesaadav avaliku URL'i kaudu
- [ ] Frontend on kättesaadav avaliku URL'i kaudu
- [ ] Frontend saab ühenduse backendiga

---

## 🔧 Levinud Probleemid ja Lahendused

### ❌ "Build failed 22 hours ago"

**Põhjus:** Railway ei tea, millist kausta buildida (rootist ei saa buildida).

**Lahendus:**
1. Kontrolli, et teenuse seadetes on **Root Directory** õigesti seadistatud:
   - Backend teenus: `backend`
   - Frontend teenus: `frontend`

2. Kontrolli, et **haru (branch)** on `railway`, mitte `main`

### ❌ "DATABASE_URL is not defined"

**Põhjus:** Backend teenus ei saa ühendust andmebaasiga.

**Lahendus:**
1. Mine Backend teenuse Settings → Variables
2. Lisa: `DATABASE_URL=${{Postgres.DATABASE_URL}}`
3. See loob automaatse lingi PostgreSQL teenusega

### ❌ "Prisma migration failed"

**Põhjus:** Migratsioonid ei käivitu või andmebaasi URL on vale.

**Lahendus:**
1. Kontrolli, et `DATABASE_URL` on õige
2. Kontrolli deploy logi Railway's
3. Kui vaja, käivita migratsioonid käsitsi:
   ```bash
   npx prisma migrate deploy
   ```

### ❌ "Frontend can't connect to backend"

**Põhjus:** CORS või vale API URL.

**Lahendus:**
1. Kontrolli, et backend `FRONTEND_URL` on õige
2. Kontrolli, et frontend `VITE_API_URL` viitab backend'i avalikule URL'ile
3. Veendu, et mõlemad teenused on **avalikult kättesaadavad** (Public Networking: ON)

### ❌ "SSL certificate errors"

**Põhjus:** Railway kasutab oma SSL-e, kohalik `generate-ssl.sh` ei ole vaja.

**Lahendus:**
Ignoreeri - Railway hoolitseb SSL eest automaatselt. Kohalikud sertifikaadid on ainult development'i jaoks.

---

## 🔄 Kuidas Uuendada (Update)

### Automaatne deploy:
1. Push muudatused `railway` harusse:
   ```bash
   git push origin railway
   ```
2. Railway tuvastab muudatused automaatselt ja deploidib uuesti

### Manuaalne redeploy:
1. Mine Railway dashboardi
2. Vali teenus (Backend või Frontend)
3. Vajuta "Deploy" → "Redeploy"

---

## 🎯 Kiireja (Quick Start)

Kui Sul on juba Railway account ja projekt loodud:

```bash
# 1. Veendu, et oled railway harul
git checkout railway

# 2. Push viimased muudatused
git push origin railway

# 3. Mine Railway dashboardi ja seadista:
#    - Backend teenus: Root Directory = backend
#    - Frontend teenus: Root Directory = frontend
#    - Lisa kõik vajalikud environment variables

# 4. Käivita redeploy
```

---

## 📚 Kasulikud Lingid

- [Railway Documentation](https://docs.railway.app/)
- [Railway Monorepo Guide](https://docs.railway.app/deploy/monorepo)
- [Railway Variables Reference](https://docs.railway.app/develop/variables)
- [Railway CLI](https://docs.railway.app/develop/cli) (kui soovid CLI kaudu deployida)

---

## 💡 Näpunäited

1. **Hoia `railway` haru eraldi:** Ära merge'i main harust railway'sse, kui pole vaja
2. **Keskkonnamuutujad:** Kasuta Railway Variables, ära pane secreteid koodi
3. **Logid:** Railway dashboard → teenus → Logs (vaata kohe, kui build failibub)
4. **Maksumus:** Railway annab $5 ilma credit card'ita, jälgi kasutust
5. **Custom Domain:** Saad lisada oma domeeni Settings → Networking → Custom Domain

---

## 🆘 Abi Vajadusel

Kui midagi ei tööta:
1. Kontrolli Railway logisid (Deployments → viimane deploy → Logs)
2. Kontrolli Build logisid (Deployments → viimane deploy → Build Logs)
3. Veendu, et kõik environment variables on seadistatud
4. Proovi redeploy'da

**Railway Support:** https://help.railway.app/

---

Edu! 🚀
