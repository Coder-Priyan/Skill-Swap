# 💻 2-Laptop Live Demo Guide (Local Network Architecture)

> **Chosen Method:** **LAN Subnet Binding over Mobile Hotspot**  
> **Status:** Code configuration already applied (`host: '0.0.0.0'` in Vite + Express).  
> **Target:** 1 Host Laptop (Server + Learner) & 1 Client Laptop (Mentor).

---

## 🏆 Kyun Ye Method Best Hai? (Why This Method?)

1. **Zero Cloud Dependency:** Cloud deployment (Render, Vercel, AWS) hackathon ke time slow ho sakti hai, cold starts ho sakte hain, ya internet drop hone pe demo atak sakta hai.
2. **Lightning Fast (<5ms latency):** Sara data packet direct local Wi-Fi/Hotspot ke through dono laptops ke beech travel karta hai. Monaco editor mein type karte hi instant doosre laptop par dikhta hai!
3. **Pure Computer Networking Flex:** Judges impress hote hain jab aap batate ho ki aapne internal network interfaces aur reverse-proxy use karke live peer network banaya hai.

---

## 🎤 Judges ke Sawaal ka Smart Answer (Judge Pitch Script)

Agar judge puche:  
> **"Aapne project cloud pe deploy nahi kiya, toh doosre laptop par bina deployment ke kaise live chal raha hai?"**

### 💬 Aapka English Answer (Confident & Technical):
> *"Sir, we are running our full stack locally on a **LAN (Local Area Network) Subnet Architecture**.  
> We configured our Express backend and Vite frontend to bind to `0.0.0.0` instead of standard loopback `127.0.0.1`.  
> Both laptops are connected to the same local subnet. Laptop 2 accesses the host’s local IPv4 endpoint. Vite automatically reverse-proxies the REST endpoints and the full-duplex WebSockets (`/socket.io` and `/yjs`) directly to our Node.js daemon.  
> Because session state is stored in browser-level `sessionStorage`, Laptop 1 acts as the **Learner** and Laptop 2 acts as the **Mentor**, exchanging live code changes and ledger events over WebSockets in real time!"*

### 💬 Aapka Hinglish Answer (Simple explanation):
> *"Sir, humne dono systems ko ek hi local network par connect kiya hai. Humne server aur frontend ko `0.0.0.0` par bind kiya hai jisse wo LAN requests listen kar sake. Laptop 2 direct Host IP ke port 5173 par hit karta hai, jahan se REST calls aur WebSockets real-time me Laptop 1 ke backend se communicate karte hain. Isse internet slow hone par bhi hamara real-time sync bina lag ke chalta hai."*

---

## 🛠️ Step-by-Step Setup: Dono Laptops Par Kya Karna Hai

### 📱 Pre-step: Mobile Hotspot On Karo (Crucial Tip!)
* **Kyun:** College/Venue Wi-Fi mein aksar *"AP Isolation"* (Access Point Isolation) on rehta hai, jo do laptops ko aapas mein communicate nahi karne deta.
* **Solution:** Apne phone ka **Personal Hotspot** on karo aur dono laptops ko usi se connect karo.

---

### 💻 LAPTOP 1 PAR KYA KARNA HAI (Host Machine - Jahan Code Hai)

#### Step 1: Apna Local IP Pata Karo
1. Press `Win + R`, type `powershell`, press Enter.
2. Run karo:
   ```powershell
   ipconfig
   ```
3. Look for **IPv4 Address** under Wireless LAN / Wi-Fi adapter.  
   *Example: `192.168.43.125`* (isko note kar lo).

#### Step 2: Backend Server Start Karo
1. Terminal 1 kholo (project folder `f:\HackathonCodeAsap\server` me):
   ```bash
   npm run dev
   ```
2. Terminal pe output aayega:
   ```text
   🚀 SkillSwap Server running at:
      Local:        http://localhost:4000
      On your wifi: http://192.168.43.125:4000
   ```

#### Step 3: Frontend Client Start Karo
1. Terminal 2 kholo (`f:\HackathonCodeAsap\client` me):
   ```bash
   npm run dev
   ```
2. Vite output show karega:
   ```text
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.43.125:5173/
   ```

#### Step 4: Laptop 1 Par Browser Kholo
* Chrome kholo aur jao: `http://localhost:5173`
* Top navigation bar se profile select karo: **Aman (Learner)**.

---

### 💻 LAPTOP 2 PAR KYA KARNA HAI (Client Machine - Dusre Teammate ka Laptop)

> ⚠️ **Laptop 2 par koi code install ya terminal chalane ki zarurat NAHI hai!**

#### Step 1: Same Hotspot Se Connect Karo
* Check karo ki Laptop 2 usi same phone ke hotspot se connected ho jisse Laptop 1 hai.

#### Step 2: Browser Kholo (Chrome / Edge / Firefox)
* URL bar me Laptop 1 ka Network URL daalo:
  ```text
  http://192.168.43.125:5173
  ```
  *(192.168.43.125 ki jagah Laptop 1 ka actual IPv4 daalna)*

#### Step 3: Profile Select Karo
* Page load hote hi top navigation bar se profile select karo: **Priya (Mentor)**.

---

## ⚡ Live Demo Walkthrough (Judges ke Saamne Presentation)

| Action No. | Laptop 1 (Aman - Learner) | Laptop 2 (Priya - Mentor) |
| :--- | :--- | :--- |
| **1** | Aman "React" search karta hai aur Priya ki profile par **"Book Session"** click karta hai. | Priya ki screen par instant **Booking Notification** aati hai. |
| **2** | Status dikhta hai *"Waiting for mentor approval..."* | Priya **"Accept"** button click karti hai. |
| **3** | Aman **"Join Live Room"** par click karta hai. | Priya **"Join Live Room"** par click karti hai. |
| **4** | **🔥 HERO MOMENT:** Aman Monaco editor me code type karta hai (e.g. `function App() { ... }`). | **Bina reload ke Priya ke screen par wo code live type hota hua dikhta hai!** |
| **5** | Priya bug fix karti hai aur "Session Complete" hota hai. | Priya ko screen par completion alert milta hai. |
| **6** | Aman 5-star rating ⭐⭐⭐⭐⭐ submit karta hai. | Priya ke credits instantly +10 badh jate hain aur Aman ke 10 credits deduct ho jate hain. |
| **7** | Ledger page khol kar dikha do: Dono laptops par exact same transaction timestamp ke sath verify ho jata hai! |

---

## 🛡️ Troubleshooting & Safety Tips (Zero Hiccup Guarantee)

1. **Agar Laptop 2 par page load na ho:**
   * Laptop 1 par Windows Firewall ka prompt aaye toh **"Allow Access on Private Networks"** par checkmark karke Allow karo.
   * Agar fir bhi na khule, Laptop 1 ke PowerShell me ye one-line command chala do (port 5173 aur 4000 open karne ke liye):
     ```powershell
     netsh advfirewall firewall add rule name="SkillSwap Hackathon" dir=in action=allow protocol=TCP localport=5173,4000
     ```
2. **Mobile Hotspot Data usage:**
   * Is process me phone ka internet balance use nahi hota, kyunki packets phone ke Wi-Fi chip ke andar hi rehte hain (local subnet transfer).
