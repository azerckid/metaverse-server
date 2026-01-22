# 🚀 Oracle Cloud (OCI) 배포 가이드

이 문서는 **Ubuntu 22.04 (또는 20.04)** 기반의 Oracle Cloud Always Free 인스턴스에 Node.js Socket.io 서버를 배포하고, **HTTPS(SSL)**까지 적용하는 전체 과정을 설명합니다.

---

## ✅ 사전 준비 (Prerequisites)
1. **Oracle Cloud 계정** 및 **VM 인스턴스** 생성 완료
   - *추천*: `VM.Standard.A1.Flex` (ARM 프로세서) - 4 OCPU, 24GB RAM 무료 제공
   - *OS*: **Ubuntu 22.04 LTS** (가장 권장)
2. **도메인 네임** (선택 사항이나 권장)
   - 프론트엔드가 Vercel(`https://`)에 있다면, 서버도 반드시 `wss://` 여야 하므로 **도메인이 필수**입니다.
   - 도메인이 없다면 클라이언트에서 `http://IP:포트`로 접속해야 하며, 이 경우 프론트엔드 브라우저 설정에서 "안전하지 않은 콘텐츠 허용"을 해야 할 수 있습니다.

---

## 1단계: 서버 접속 및 기본 설정
터미널에서 SSH 키를 이용해 서버에 접속합니다.

```bash
# 로컬 터미널
ssh -i "경로/to/your/private_key.key" ubuntu@<서버_공인_IP>
```

접속 후, 패키지 리스트를 업데이트하고 필수 도구를 설치합니다.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

---

## 2단계: Node.js 설치 (nvm 사용)
최신 안정화 버전(LTS)의 Node.js를 설치합니다.

```bash
# nvm (Node Version Manager) 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 환경 변수 반영
source ~/.bashrc

# Node.js LTS 버전 설치
nvm install --lts
nvm use --lts

# 설치 확인
node -v
npm -v
```

---

## 3단계: 프로젝트 가져오기 및 실행

### 1. 깃허브에서 코드 클론
```bash
# 깃 레포지토리 주소는 본인의 것으로 변경하세요
git clone https://github.com/사용자명/레포지토리이름.git
cd 레포지토리이름/mogame2_server
```

### 2. 의존성 설치 및 빌드
```bash
npm install

# TypeScript 컴파일 (빌드 스크립트가 있다면)
npm run build
# 만약 build 스크립트가 없다면 ts-node로 직접 실행하거나, tsc로 컴파일해야 합니다.
# ts-node를 운영 환경에서 쓰려면: npm install -g ts-node typescript
```

### 3. PM2로 무중단 실행
서버 터미널을 꺼도 프로세스가 죽지 않도록 **PM2**를 사용합니다.

```bash
# PM2 설치
npm install -g pm2

# 서버 실행 (진입점이 src/index.ts인 경우 ts-node 사용)
pm2 start src/index.ts --interpreter ./node_modules/.bin/ts-node --name "game-server"

# 또는 빌드된 js 파일(dist/index.js)이 있다면
# pm2 start dist/index.js --name "game-server"

# 상태 확인
pm2 status
pm2 logs game-server
```

---

## 4단계: 방화벽 설정 (가장 중요)
오라클 클라우드는 **2중 방화벽** 구조입니다. ① 오라클 웹 콘솔(Security List)과 ② 리눅스 내부 방화벽(iptables) 두 곳을 모두 열어야 합니다.

### 1. 오라클 클라우드 웹 콘솔 설정
1. OCI 대시보드 접속 -> **Compute** -> **Instances** -> 본인 인스턴스 클릭.
2. **Subnet** 링크 클릭 -> **Security Lists** -> **Default Security List** 클릭.
3. **Ingress Rules**에서 `Add Ingress Rules` 클릭.
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: TCP
   - **Destination Port Range**: `5050` (또는 사용하는 포트), `80`, `443`
4. 저장.

### 2. 리눅스 내부 방화벽 (iptables) 해제
오라클 우분투 이미지는 기본적으로 모든 포트가 막혀 있습니다.

```bash
# 80(HTTP), 443(HTTPS), 5050(게임서버) 포트 개방
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5050 -j ACCEPT

# 설정 저장 (재부팅 후에도 유지되도록)
sudo netfilter-persistent save
```

🚀 **여기까지만 해도 `http://<서버IP>:5050` 으로 접속이 가능해야 합니다.**
하지만 Vercel 등 HTTPS 환경의 프론트엔드와 통신하려면 **아래 과정(HTTPS 적용)**이 필수입니다.

---

## 5단계: 도메인 연결 및 SSL (HTTPS) 적용
**Nginx**를 리버스 프록시로 사용하여 SSL 인증서를 적용하고, 내부의 5050 포트로 트래픽을 전달합니다.

### 1. 도메인 설정
도메인 구입처(가비아, GoDaddy 등)의 DNS 설정에서 A 레코드를 추가합니다.
- 호스트: `@` (또는 `api` 등 서브도메인)
- 값(Value): 오라클 인스턴스의 **Public IP**

### 2. Nginx 설치
```bash
sudo apt install nginx -y
```

### 3. Nginx 설정 파일 작성
```bash
sudo nano /etc/nginx/sites-available/gameserver
```
아래 내용을 붙여넣으세요. (`your-domain.com`을 본인 도메인으로 변경)

```nginx
server {
    server_name your-domain.com; # 예: api.metaversedao.com

    location / {
        proxy_pass http://localhost:5050; # 내부 Node 서버 포트
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade; # 웹소켓 필수 헤더
        proxy_set_header Connection 'upgrade';  # 웹소켓 필수 헤더
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**설정 활성화**:
```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/gameserver /etc/nginx/sites-enabled/

# 기본 설정 삭제 (충돌 방지)
sudo rm /etc/nginx/sites-enabled/default

# 문법 검사 및 재시작
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Certbot으로 무료 SSL 인증서 발급 (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx -y

# 인증서 발급 및 Nginx 자동 설정
sudo certbot --nginx -d your-domain.com
```
- 이메일 입력 및 약관 동의 절차를 진행하면 자동으로 HTTPS 설정이 완료됩니다.

---

## 🏁 최종 확인
이제 프론트엔드 코드에서 소켓 연결 주소를 다음과 같이 변경합니다.

- **기존 (로컬)**: `http://localhost:5050`
- **변경 (배포)**: `https://your-domain.com` (포트 번호 없이! Nginx가 443 -> 5050으로 넘겨주기 때문)

축하합니다! 이제 안전한 HTTPS/WSS 기반의 게임 서버가 구축되었습니다.
