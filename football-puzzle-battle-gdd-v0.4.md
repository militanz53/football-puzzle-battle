# FOOTBALL PUZZLE BATTLE
## Game Design Document — v0.4

> **v0.4 Değişiklik Notu:** v0.3'ün sonunda açık bırakılan tek karar noktası — Photo Reveal için illüstrasyon mu yoksa lisanslı fotoğraf mı kullanılacağı — kapatıldı: **illüstrasyon** seçildi (bkz. §9.2.1). Belgede artık geliştirmeyi bekleten açık bir karar kalmamıştır; CCGS'ye bu haliyle devredilebilir.

---

## 1. Proje Özeti

**Working Title:** Football Puzzle Battle
**Tür:** Competitive Football Trivia / Puzzle / Multiplayer
**Platform:** Web öncelikli, daha sonra iOS ve Android
**Oyuncu Sayısı:** 1–2
**Ana Mod:** Gerçek zamanlı 1v1
**Maç Süresi:** Yaklaşık 4–6 dakika
**Hedef Kitle:** Futbol takip eden 15–40 yaş arası oyuncular
**Temel Deneyim:** Futbol bilgisini hızlı ve görsel bulmacalar üzerinden rakibe karşı kullanmak.

Football Puzzle Battle, klasik çoktan seçmeli futbol quizlerinden farklı olarak oyuncuya görsel ve etkileşimli futbol bulmacaları sunar.

- Her maçta iki oyuncu aynı bulmacaları aynı anda görür.
- Bulmacadaki bilgiler kademeli olarak açılır.
- Oyuncu cevabı bildiğini düşündüğü anda BUZZ butonuna basar.
- Daha erken doğru cevap daha yüksek puan kazandırır.
- Bir maç farklı türlerde 5 futbol bulmacasından oluşur.

---

## 2. Oyunun Vizyonu

Oyunun amacı futbol bilgisini test eden klasik quiz uygulamalarından daha rekabetçi ve daha oyun hissi veren bir deneyim oluşturmaktır.

Oyuncunun hissetmesi gereken temel duygu:

> "Ben bunu senden önce bildim."

Oyun futbol bilgisini üç unsurla birleştirir: **Knowledge + Speed + Risk**

Oyuncunun sadece doğru cevabı bilmesi yeterli değildir. Ne kadar erken cevap verdiği de önemlidir.

---

## 3. Temel Tasarım Prensipleri

### 3.1 Kolay Öğrenme
Yeni oyuncu oyunu birkaç saniye içinde anlayabilmelidir. Temel mekanik: **REVEAL → BUZZ → ANSWER**. Bu sistem bütün puzzle türlerinde aynıdır.

### 3.2 Kısa Maçlar
Bir maçın hedef süresi: 4–6 dakika. Oyuncu kısa sürede Quick Match, Rematch, Friend Challenge oynayabilmelidir.

### 3.3 Görsel Odaklı Oynanış
Oyun klasik metin tabanlı quiz gibi görünmemelidir. Puzzle'larda mümkün olduğunca futbol sahaları, oyuncu kartları, bağlantı grafikleri, kariyer yolları, takım dizilişleri, fotoğraf parçaları, pas rotaları kullanılacaktır.

### 3.4 Rekabet
Oyuncunun ana motivasyonu soru çözmekten çok rakibini yenmek olmalıdır. Puzzle, rekabetin aracıdır.

### 3.5 Tekrar Oynanabilirlik
Her maç farklı puzzle kombinasyonları ve farklı sorular sunmalıdır. Uzun vadede yüzlerce veya binlerce puzzle içeriği bulunabilir.

---

## 4. Core Gameplay Loop

```
Home → Play → Opponent Found → 5 Round Match → Score Calculation
→ Winner → XP / Rating / Rewards → Rematch veya New Match
```

---

## 5. Maç Yapısı

Standart maç: 5 round. Her round farklı puzzle türüdür.

| Round | Puzzle |
|---|---|
| 1 | Goal Map |
| 2 | Photo Reveal |
| 3 | Missing XI |
| 4 | Career Journey |
| 5 | Teammate Web |

İleride puzzle havuzu büyüdüğünde sistem 10–20 farklı puzzle arasından rastgele seçim yapabilir.

---

## 6. Reveal Sistemi

Oyunun ana mekaniklerinden biridir. Her puzzle başlangıçta minimum bilgi gösterir. Belirli aralıklarla yeni bilgiler açılır.

**Örnek — Career Journey:**

```
Başlangıç:        Ajax → ? → ? → ? → ?
3 saniye sonra:   Ajax → Juventus → ? → ? → ?
3 saniye sonra:   Ajax → Juventus → Inter → ? → ?
3 saniye sonra:   Ajax → Juventus → Inter → Barcelona → ?
```

Oyuncu istediği anda BUZZ butonuna basabilir. Daha az reveal gördüğünde doğru cevap verirse daha fazla puan kazanır.

### 6.1 Reveal Timing Standardizasyonu

- **Sabit reveal aralığı:** Her puzzle türünde reveal'ler arası **3 saniye**.
- **Round başına toplam reveal penceresi:** 5 reveal × 3 saniye = **15 saniye**. Oyuncu buzz basmazsa 15. saniyede round otomatik olarak "cevapsız" sayılır (0 puan).
- Bu süre, puzzle zorluk seviyesine göre ileride ayarlanabilir bir parametre olarak DB'de tutulmalı (`reveal_interval_seconds` alanı — bkz. §24.1), ancak MVP'de tüm puzzle'lar için sabit 3 saniye kullanılacaktır. Zorluk bazlı hız farklılaştırması Phase 2 konusudur.
- İstisna yok: Goal Map, Photo Reveal, Missing XI, Career Journey ve Teammate Web hepsi bu 3 saniyelik ritmi kullanır.

---

## 7. Buzz Sistemi

Her round boyunca ekranda büyük bir **BUZZ** butonu bulunur. Oyuncu cevabı bildiğini düşündüğünde butona basar.

Buzz sonrası:
- reveal durur
- cevap ekranı açılır
- oyuncunun cevap için yaklaşık 8 saniyesi vardır

Oyuncu doğru cevaplarsa puan kazanır. Yanlış cevap verirse o round için cevap hakkını kaybeder. Rakip puzzle'a devam edebilir. Bu sistem oyuncuyu risk almaya teşvik eder.

---

## 8. Puanlama Sistemi

| Reveal aşaması | Puan |
|---|---|
| Reveal 1 | 1000 |
| Reveal 2 | 800 |
| Reveal 3 | 600 |
| Reveal 4 | 400 |
| Reveal 5 | 200 |
| Yanlış cevap | 0 |

İlk MVP'de negatif puan kullanılmayacaktır. İleride Ranked modunda yanlış cevap cezası eklenebilir.

---

## 9. Puzzle Türleri

### PUZZLE 1 — GOAL MAP

**Amaç:** Ünlü bir golü atan futbolcuyu tahmin etmek.

**Görsel:** Top-down futbol sahası. Saha üzerinde oyuncu pozisyonları, top, pas rotaları, şut noktası gösterilir. Animasyon ile pozisyon yeniden canlandırılabilir.

**Reveal Örneği (her 3 saniyede bir açılır — bkz. §6.1):**
1. Pas rotası
2. Turnuva — Champions League
3. Sezon — 2014/15
4. Rakip — Bayern Munich
5. Dakika — 77'

**Soru:** Who scored?

**Tasarım Amacı:** Oyunun imza puzzle'larından biri olması hedeflenmektedir.

---

### PUZZLE 2 — PHOTO REVEAL

**Amaç:** Fotoğraftaki futbolcuyu tahmin etmek.

**Başlangıç:** Fotoğraf yüksek zoom, crop, blur, silhouette şeklinde gösterilir. Zaman geçtikçe görüntü açılır.

**Reveal Örneği:**
1. Saç / forma detayı
2. Gövde
3. Takım rengi
4. Yüzün bir kısmı
5. Tam fotoğraf

**Alternatif Sorular:** Who is the player? / Which club? / Which match? / Which season?

#### 9.2.1 MVP'de Lisans-Güvenli Uygulama — Karar: İllüstrasyon **[v0.4 — kesinleşti]**

- **MVP'de gerçek oyuncu fotoğrafı kullanılmayacaktır.** Photo Reveal, elle çizilmiş / stilize edilmiş **illüstrasyon-silüet portreler** kullanır (oyunun kendi sanat stilinde — bkz. §22). Blur/crop yerine "illüstrasyonun parçalarının aşamalı açılması" kullanılır (örn. saç/forma detayı → gövde → takım rengi → yüzün bir kısmı → tam illüstrasyon).
- Bu karar telif riskini sıfıra indirir ve oyunun görsel kimliğine katkı sağlar (§22'deki koyu lacivert/yeşil, Space Grotesk/Manrope diliyle aynı illüstrasyon stili kullanılmalıdır).
- İçerik üretim etkisi: 50 puzzle'lık MVP setinde Photo Reveal'e ayrılan 10 puzzle için 10 orijinal illüstrasyon-portre üretilmesi gerekir — bu bir tasarımcı/illüstratör iş paketidir, araştırma veya lisans kontrolü gerekmez.
- `image_source` alanı (bkz. §24.1) MVP'de sabit `illustration` değerini taşır; `license_type` alanı bu nedenle MVP'de kullanılmaz (Phase 2'de gerçek foto opsiyonu değerlendirilirse tekrar devreye girer).
- Gerçek maç görüntüsü/videosu hiçbir aşamada (MVP dahil sonraki fazlarda da) kullanılmayacaktır (bkz. §35).

---

### PUZZLE 3 — MISSING XI

**Amaç:** Bir takımın veya tarihi maçın ilk 11'indeki eksik futbolcuyu bulmak.

#### 9.3.1 Görsel Format

- Oyuncular **saha üzerinde, gerçek pozisyonlarına göre** (§3.3'teki "futbol sahaları" prensibiyle uyumlu) bir dizilim şemasında (örn. 4-3-3) kart olarak gösterilir.
- Her kart: oyuncu adı + forma numarası (biliniyorsa).
- Eksik oyuncunun pozisyonu **boş, çerçeveli, soru işaretli bir kart** olarak sahada aynı yerde durur — liste sırasına değil, saha konumuna bakılarak anlaşılır.
- Diğer 10 oyuncu MVP'de baştan görünür durumdadır (bunlar "verilen bilgi"dir); reveal sistemi bu puzzle'da oyuncu isimlerini değil, **bağlamsal ipuçlarını** açar (aşağıdaki reveal sırası).

**Reveal Örneği:**
1. Formation
2. Competition
3. Season
4. Opponent
5. Player position (eksik oyuncunun sahadaki mevkisi — örn. "Right Wing")

**Soru:** Who is missing?

---

### PUZZLE 4 — CAREER JOURNEY

**Amaç:** Kulüp kariyerinden futbolcuyu tahmin etmek.

**Görsel:** Timeline.

```
Ajax → Juventus → Inter → Barcelona → AC Milan → PSG
```

**Cevap:** Zlatan Ibrahimović

**Reveal:** Kulüpler sırayla açılır (3 saniye aralıkla — §6.1). İlk kulüplerden tahmin yapmak daha yüksek puan kazandırır.

**Zorluk Seviyesi:**
- **Easy:** Kulüp isimleri + tarihler.
- **Medium:** Kulüp isimleri.
- **Hard:** Sadece takım renkleri, ülkeler veya şehirler.

---

### PUZZLE 5 — TEAMMATE WEB

**Amaç:** Birden fazla futbolcuyla takım arkadaşlığı yapmış ortak oyuncuyu bulmak.

**Görsel:** Ortada `?`, çevresinde oyuncular.

```
Messi   Neymar   Mbappé   Iniesta   Suárez
```

**Soru:** Which player connects them?

Her reveal ile yeni bir bağlantı eklenir (3 saniye aralıkla — §6.1). Başlangıçta iki futbolcu gösterilir, sonra üçüncü ve dördüncü açılır.

---

## 10. Maç Ekranı

- **Üst kısım:** Player A — Score vs Score — Player B
- **Orta bölüm:** Aktif puzzle
- **Alt bölüm:** Reveal timer (örn. `NEXT CLUE: 03`)
- **En alt:** Büyük BUZZ butonu

Somut referans için bkz. §22.3 (Match ekranı mockup'ı).

---

## 11. Round Sonuç Ekranı

```
CORRECT!
XAVI HERNÁNDEZ
+800
YOU BUZZED AFTER 2 CLUES
```

Ardından toplam skor animasyonla güncellenir. Sonraki round yaklaşık 2 saniye sonra başlar.

---

## 12. Match Result

5 round tamamlandığında:

```
MATCH RESULT
KADIR   3650
  VS
EMRE    3100
VICTORY
```

Altında: Correct Answers, Average Buzz Time, Best Round, Fastest Answer, XP Earned, Rating Change bulunabilir.

### 12.1 Beraberlik Kuralı

- 5 round sonunda toplam skor eşitse, **Sudden Death Round** oynanır: sistemden rastgele seçilen 1 ek puzzle, aynı REVEAL → BUZZ → ANSWER mekaniğiyle. İlk doğru cevaplayan kazanır.
- Sudden Death round'da da her iki oyuncu yanlış cevaplarsa veya süre dolarsa, yeni bir Sudden Death round başlar (tekrar rastgele puzzle). Bu, MVP'de bot vs player için de aynı şekilde çalışır (bot mantığı için bkz. §29.1).
- Practice modunda (rakipsiz) beraberlik durumu zaten oluşmaz, bu kural yalnızca 1v1/bot maçları için geçerlidir.

---

## 13. Oyun Modları

### 13.1 Quick Match
Ana multiplayer modu. Sistem rastgele rakip bulur.

### 13.2 Challenge Friend
Oyuncu arkadaşına bağlantı gönderir (örn. `footballgame.com/challenge/8KD2X`). Rakip linke tıklar, nickname seçer, maç başlar. İlk aşamada hesap oluşturmak zorunlu olmayabilir.

### 13.3 Practice
Tek oyunculu mod. Rakip yoktur. Puzzle çözerek pratik yapılır.

### 13.4 Daily Challenge
Her gün herkese aynı puzzle seti (Daily Football 5 — 5 puzzle). Dünya genelinde skor sıralaması. Sonuç paylaşılabilir.

### 13.5 Ranked
MVP sonrası. Oyuncular rating kazanır veya kaybeder.

---

## 14. Rank Sistemi

ROOKIE → SEMI-PRO → PRO → ELITE → WORLD CLASS → LEGEND → GOAT

Rank ilerlemesi Elo/MMR benzeri sisteme dayanabilir.

---

## 15. Player Profile

**Profil ekranı:** Username, Avatar, Football IQ, Rank, Matches, Wins, Losses, Win Rate, Best Streak, Average Answer Time

**Puzzle İstatistikleri:** Goal Knowledge, Player Knowledge, Transfers, Lineups, Football History, Clubs

Örnek: Goal Map — 86 / Photo Reveal — 91 / Missing XI — 72 / Career Journey — 88 / Teammate Web — 75

---

## 16. Football IQ

Oyuncuya tek bir genel bilgi puanı verilebilir (örn. Football IQ: 1847). Bu sayı performans, doğruluk, cevap hızı, puzzle zorluğu gibi kriterlerden hesaplanabilir. Paylaşılabilir profil kartları oluşturulabilir.

---

## 17. Progression

Oyuncu maçlardan XP kazanır. XP: level yükseltir, profil kozmetikleri açar, badge verir. XP oyuncuya oyun içi avantaj sağlamaz — **Pay-to-win kullanılmayacaktır.**

---

## 18. Cosmetic System

Avatar Frame, Profile Badge, Buzz Button Skin, Answer Animation, Victory Animation, Goal Animation, Profile Background, Puzzle Theme

Örnek temalar: Retro Football, Champions Night, World Cup, Street Football, 90s Football

---

## 19. Monetization

**Ana model:** Free-to-play

- **Reklam:** Maç sırasında gösterilmez. Potansiyel yerler: Match Result sonrası, Rematch öncesi, Daily Challenge sonrası.
- **Rewarded Ads:** İsteğe bağlı reklam (bonus cosmetic currency, extra Daily Challenge, practice bonus). Reklam izlemek hiçbir zaman multiplayer avantajı sağlamamalıdır.
- **Ad-Free:** Tek seferlik ödeme ile reklam kaldırılabilir.
- **Cosmetics:** Oyuncular isteğe bağlı kozmetik satın alabilir.
- **Sponsored Challenges:** İleride markalar için "Daily Challenge presented by X" şeklinde sponsorlu içerikler.

---

## 20. Para Birimi

İleride oyun içi currency eklenebilir (örn. Football Coins). Coins: maç, daily challenge, achievement, rewarded ads ile kazanılabilir. Cosmetic satın almak için kullanılabilir. Gerçek parayla da coin paketleri satılabilir.

---

## 21. Ana Menü

**MVP ana ekranı:** Logo, PLAY, CHALLENGE FRIEND, PRACTICE, Daily Challenge, Profile, Leaderboard, Shop

**İlk prototipte** sadece: PLAY, PRACTICE, HOW TO PLAY yeterlidir. Somut referans için bkz. §22.3.

---

## 22. Görsel Stil **[v0.3 — finalize edildi]**

> Bu bölüm, ayrı bir mockup turunda 4 ekran (Ana Menü, Maç/Buzz, Round Sonucu, Maç Sonucu) üzerinden denenip onaylanan somut görsel yöndür. CCGS bu tokenleri doğrudan CSS değişkenleri / Tailwind config olarak kullanabilir.

Referans hissi: Sofascore, EA FC, Football Manager, modern mobile games — ancak hiçbirinin doğrudan tasarımı kopyalanmayacaktır.

### 22.1 Renk Paleti

| Token | Hex | Kullanım |
|---|---|---|
| `bg-primary` | `#0B1220` | Ana arka plan (koyu lacivert/charcoal) |
| `bg-surface` | `#121A2A` | Kart / panel zemini |
| `bg-surface-alt` | `#1E2A3D` | İkincil chip / progress track zemini |
| `border-subtle` | `#26344A` | Outline buton kenarlığı, kart kenarlığı |
| `accent` | `#3ED598` | Marka rengi — CTA butonlar, doğru cevap, vurgu |
| `accent-hover` | `#2FBF83` | Accent hover/active durumu |
| `text-primary` | `#F2F5F7` | Ana metin |
| `text-secondary` | `#8B98A9` | İkincil metin, açıklama |
| `text-muted` | `#6B7A8D` / `#4A5A70` | Etiket, caption, pasif metin |

Kural: Saha ve aktif oyun elementlerinde yeşil (`accent`) tonları kullanılır; rakip/pasif oyuncu skorları `text-secondary` ile gösterilir, yalnızca kazanan/aktif taraf `accent` alır.

### 22.2 Tipografi

- **Display / başlıklar / butonlar:** **Space Grotesk** (600, 700) — Google Fonts.
- **Gövde metni:** **Manrope** (400, 600, 800) — Google Fonts.
- Inter, Roboto, Arial gibi jenerik varsayılan fontlar kullanılmayacaktır — oyunun karakterli bir görsel kimliği olması hedeflenir.
- Büyük typography, az metin, büyük görseller (§3.3 ile tutarlı). Round ekranında puzzle mümkün olduğunca ekranın merkezini kaplamalıdır.

### 22.3 Ekran Referansları

Onaylanmış statik mockup'lar şu linkte, tek canvas üzerinde 4 ekran olarak duruyor — CCGS geliştirmeye başlamadan önce bunlara bakmalı:

**https://claude.ai/artifact/1X7aVnxrTpDmTSWTYj4DYP**

İçerdiği ekranlar:
1. **Ana Menü** — logo, büyük dolu-yeşil PLAY butonu, outline PRACTICE butonu, ghost HOW TO PLAY
2. **Maç Ekranı** — üstte skor karşılaştırması + round progress bar, ortada aktif puzzle kartı (Career Journey örneği), altta sabit büyük dairesel BUZZ butonu
3. **Round Sonucu** — check-mark ikonu, doğru cevap, büyük "+800" puan, "kaç reveal'de buzzladın" bilgisi
4. **Maç Sonucu** — VICTORY başlığı, skor karşılaştırma çubuğu, 2x2 istatistik grid'i, REMATCH / HOME butonları

Bu 4 ekran, oyunun tüm diğer ekranları (Profile, Shop, Daily Challenge vb.) için de referans stil kaynağıdır — aynı renk/tipografi/spacing dilini korumalıdırlar.

### 22.4 UI Kuralları

- Mobil öncelikli tasarım (referans genişlik: 390px).
- Büyük dokunma hedefleri — BUZZ butonu ekranın en belirgin, en büyük elemanı olmalı.
- Kartlar: `border-radius` 12–20px arası, `bg-surface` zemin, `border-subtle` ince kenarlık.
- CTA butonlar: dolgulu + `accent` arka plan + koyu (`bg-primary`) metin; ikincil butonlar outline; üçüncül aksiyonlar ghost/link stilinde.

---

## 23. Ses Tasarımı

Sesler kısa ve tatmin edici olmalıdır: Buzz sesi, Correct answer, Wrong answer, Reveal sound, Round start, Score increase, Victory, Defeat. Hafif stadium ambience opsiyonel olabilir.

---

## 24. Content System

Sorular doğrudan kod içinde tutulmamalıdır. Database kullanılmalıdır.

Her puzzle için ortak alanlar: ID, Type, Difficulty, Question, Correct Answer, Alternative Answers, Reveal Data, Competition, Season, Tags, Status

### 24.1 Güncellenmiş Şema

| Alan | Açıklama |
|---|---|
| `reveal_interval_seconds` | MVP'de sabit `3`; ileride puzzle bazlı override için ayrılmış alan |
| `image_source` | (Photo Reveal için) MVP'de sabit `illustration` (bkz. §9.2.1) |
| `license_type` | (Photo Reveal için) MVP'de kullanılmıyor — yalnızca ileride gerçek foto opsiyonu açılırsa devreye girer |
| `answer_aliases` | Alternatif kabul edilen cevap yazımları listesi (bkz. §26) |

---

## 25. Örnek Puzzle Data

**Career Journey:**
```
ID: career_001
Answer: Zlatan Ibrahimović
Difficulty: Medium
Reveal 1: Malmö
Reveal 2: Ajax
Reveal 3: Juventus
Reveal 4: Inter
Reveal 5: Barcelona
reveal_interval_seconds: 3
answer_aliases: ["Ibrahimovic", "Zlatan", "Ibra"]
```

---

## 26. Cevap Doğrulama

Oyuncular aynı ismi farklı şekillerde yazabilir (örn. Cristiano Ronaldo / Ronaldo / C Ronaldo / Cristiano). Database alternatif cevapları desteklemelidir.

### 26.1 MVP Kapsamına Alınması

- **MVP'de zorunlu:** Her puzzle kaydında `answer_aliases` listesi (bkz. §24.1) ile önceden tanımlanmış alternatif isimlerin tam eşleşmesi (case-insensitive, boşluk/aksan normalize edilmiş).
- **Phase 2'ye ertelenen:** Serbest-metin typo toleransı (Levenshtein distance vb. bulanık eşleştirme).

---

## 27. Multiplayer Architecture

Multiplayer server-authoritative olmalıdır. Server kontrol eder: Puzzle ID, Round Start Time, Reveal Timing, Buzz Time, Answer, Score, Round Result. Client tek başına skor belirleyemez — bu cheat ihtimalini azaltır.

---

## 28. Disconnect

Oyuncu kısa süreli bağlantı kaybederse yaklaşık 15 saniye reconnect hakkı verilebilir. Bağlanmazsa maç kaybedilmiş sayılabilir.

---

## 29. MVP

İlk prototipte gerçek multiplayer yapılmayacaktır.

**MVP 0.1:** Local player vs bot. 5 puzzle. 5 round. Reveal. Buzz. Answer. Score. Match Result.

### 29.1 Bot Mantığı

- **Buzz zamanlaması:** Bot, her puzzle için önceden tanımlanmış bir `bot_difficulty` alanına (Easy / Medium / Hard) göre, o reveal aşamasından sonra sabit + rastgele bir gecikmeyle buzz basar:
  - Easy bot: Reveal 4–5 arasında buzz basar.
  - Medium bot: Reveal 2–4 arasında, puzzle'ın kendi `Difficulty` alanına göre ağırlıklı rastgele.
  - Hard bot: Reveal 1–3 arasında, oyuncuyu zorlayacak şekilde erken buzz basar.
- **Doğruluk oranı:** Bot'un doğru cevap verme ihtimali sabit bir yüzdedir (öneri: Easy %50, Medium %70, Hard %85).
- **Gecikme mekaniği:** Buzz sonrası bot'un "cevap yazma" süresi simüle edilir (örn. 1.5–3 saniye rastgele bekleme).
- **MVP'de tek bot seviyesi yeterlidir** (öneri: Medium). Ancak alan şeması (`bot_difficulty`) MVP'den itibaren var olmalı.
- **Sudden Death'te bot davranışı** (§12.1): Aynı kurallarla, seçilen zorluk seviyesinde devam eder.

---

## 30. MVP Puzzle Sayısı

| Puzzle Türü | Adet |
|---|---|
| Goal Map | 10 |
| Photo Reveal | 10 |
| Missing XI | 10 |
| Career Journey | 10 |
| Teammate Web | 10 |
| **Toplam** | **50** |

---

## 31. MVP Sonrası

**Phase 2:** Real-time multiplayer, Friend Challenge, Accounts, Profiles, Practice'te bot zorluk seçimi, Typo tolerance

**Phase 3:** Ranked, Football IQ, Leaderboards, Daily Challenge, Achievements

**Phase 4:** Cosmetics, Shop, Ads, Ad-Free

**Phase 5:** Yeni puzzle türleri, Tournament Mode, Season system, Clans, Events, Sponsored Challenges

---

## 32. Gelecekte Eklenebilecek Puzzle'lar

Kit Detective, Guess the Stadium, Heatmap Detective, Guess the Match, Transfer Puzzle, Manager Career, Football Connections, Stats Detective, Trophy History, Guess the Season, Badge Reveal, Guess the Club, Football Timeline

---

## 33. Teknik Stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS
- **Backend:** Supabase, PostgreSQL
- **Realtime:** Supabase Realtime / WebSockets
- **Hosting:** Vercel
- **Mobile:** Capacitor

---

## 34. Goal Map Teknolojisi

Goal Map için oyun motoru kullanılmasına gerek yoktur. SVG veya HTML Canvas kullanılabilir. Futbol sahası çizilir; üzerine players, ball, passes, shot yerleştirilir. Animasyon CSS veya JavaScript ile yapılabilir.

---

## 35. İçerik ve Lisans

Gerçek maç videoları MVP'de kullanılmayacaktır — yayın haklarıyla ilgili risk bu sayede azaltılır. Goal Map kendi oluşturduğumuz saha rekonstrüksiyonlarını kullanacaktır. Photo Reveal'in MVP uygulaması için bkz. §9.2.1.

---

## 36. Temel Başarı Kriterleri

Oyuncu bir maçtan sonra rematch yapmak istiyor mu? / Ortalama maç süresi / Puzzle başına cevap süresi / Doğru cevap oranı / Buzz kullanım süresi / İkinci maç oynama oranı / Daily retention

---

## 37. Ana KPI

**Matches per User** — ürünün başarısı oyuncunun tekrar tekrar maç yapmak istemesine bağlıdır.

---

## 38. Oyunun En Önemli Özelliği

Football Puzzle Battle'ın farkı tek tek puzzle fikirleri değildir. Temel ürün: **Mixed Football Puzzle Multiplayer**. Oyuncular belirli bir quiz seçmez; PLAY butonuna basar, sistem farklı futbol bulmacalarından oluşan bir maç oluşturur.

---

## 39. Örnek Maç

```
MATCH START — KADIR vs EMRE

ROUND 1 — GOAL MAP
Kadir: Reveal 2'de doğru cevap. +800
Emre: Yanlış. +0

ROUND 2 — PHOTO REVEAL
Emre: Reveal 1'de doğru. +1000
Kadir: Cevap vermedi.

ROUND 3 — MISSING XI
Kadir: +600
Emre: +400

ROUND 4 — CAREER JOURNEY
Kadir: +800
Emre: +600

ROUND 5 — TEAMMATE WEB
Emre: +1000
Kadir: +600

FINAL
Kadir: 2800
Emre: 3000
EMRE WINS
```

---

## 40. İlk Geliştirme Hedefi

Kullanıcı tarayıcıda oyunu açar → PLAY'e basar → Bot ile eşleşir → 5 farklı puzzle oynar → Buzz kullanır → Cevap verir → Puan kazanır → 5 round sonunda kazanan belli olur (beraberlikte §12.1 uygulanır).

Bu aşamada **login, shop, rank, ads, real multiplayer gerekmemektedir.** Önce core gameplay'in eğlenceli olduğu doğrulanmalıdır. Görsel stil için §22 referans alınmalıdır.

---

## 41. Projenin Tek Cümlelik Tanımı

**Football Puzzle Battle is a fast competitive multiplayer game where players race to solve visual football puzzles before their opponent.**

---

## Ek: Değişiklik Geçmişi

| Versiyon | Değişiklik |
|---|---|
| v0.1 | İlk taslak |
| v0.2 | Reveal timing standardizasyonu, bot mantığı, Missing XI görsel formatı, beraberlik kuralı, Photo Reveal lisans çözümü, cevap doğrulamanın MVP kapsamına alınması |
| v0.3 | §22 Görsel Stil finalize edildi — somut renk paleti, tipografi tokenleri ve onaylı mockup referans linki eklendi. Belge artık CCGS'ye tek kaynak olarak verilebilir. |
| v0.4 | §9.2.1 kesinleşti — Photo Reveal için illüstrasyon kararı verildi. Belgede açık karar kalmadı. |

---

## CCGS'ye Devir Notu

Bu belge, geliştirmeye başlamak için gereken tüm kararları içerir:
- Kapsam ve MVP sınırları: §29–30, §40
- Oynanış mekanikleri ve reveal/puanlama kuralları: §6–8, §12.1
- Puzzle içerik şeması: §24–26
- Bot davranışı: §29.1
- Teknik stack: §33
- Görsel stil (renk/tipografi/mockup referansı): §22

Belgede geliştirmeyi bekleten açık bir karar kalmamıştır. Photo Reveal için illüstrasyon kararı verilmiştir (§9.2.1) — CCGS bu 10 puzzle için illüstrasyon-portre üretim iş paketini içerik takvimine dahil etmelidir.
