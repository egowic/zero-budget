# Zero Budget — Proje Handover

Son güncelleme: 13 Ağustos 2026  
Aktif branch: `main`  
Bu doküman oluşturulmadan önceki son uygulama commit'i: `9cd2a5f`

Bu dosya, projenin Claude Code ile başlayan ilk geliştirme aşamasından sonra
Codex ile devam eden oturumda yapılan işleri ve mevcut teknik durumu devralacak
kişiye aktarmak için hazırlanmıştır. Gizli anahtarlar ve kullanıcı parolaları
bilerek bu dosyaya dahil edilmemiştir.

## 1. Proje özeti

Zero, iPhone'da Safari üzerinden Ana Ekran'a eklenerek kullanılan, React +
TypeScript ile yazılmış local-first bir bütçe PWA'sıdır.

- Uygulama: <https://egowic.github.io/zero-budget/>
- GitHub: <https://github.com/egowic/zero-budget>
- Supabase dashboard:
  <https://supabase.com/dashboard/project/epjlcfvccbzxrakhheqq>
- Supabase project ref: `epjlcfvccbzxrakhheqq`
- Supabase bölgesi: Central EU (Frankfurt)
- Deployment: GitHub Pages + GitHub Actions
- Ana kullanım hedefi: tek kullanıcı, iPhone, “Open as Web App” modu
- Test edilen cihaz koşulu: iOS 27 beta

Uygulama önce cihazdaki IndexedDB'ye yazar. Supabase cihazlar arası sync ve
dayanıklı bulut kopyası olarak kullanılır. Arayüz internet veya Supabase yanıtını
beklemeden yerel veriden açılır.

## 2. Claude Code'dan devralınan temel

Codex oturumu başladığında uygulamanın büyük bölümü zaten tamamlanmıştı:

- React/Vite/Tailwind tabanlı mobil arayüz
- Activity ve Budgets ekranları
- Harcama ve bütçe oluşturma/düzenleme
- Dexie/IndexedDB yerel veri katmanı
- Outbox tabanlı local-first sync taslağı
- PWA manifesti ve service worker
- GitHub Pages deployment workflow'u
- Kategori yönetimi
- Özel bütçe tarih aralığı
- Para ve tarih hesapları için unit testler
- Uygulamanın ilk canlı yayını

Claude Code oturumunun son kısmında Supabase projesi oluşturulmuş, ancak SQL
şeması ve bağlantı süreci tamamlanamadan oturum limiti bitmişti.

## 3. Codex oturumunda tamamlanan işler

### 3.1 Supabase kurulumu ve sync

- `supabase/schema.sql` tamamlandı ve Supabase projesine uygulandı.
- `categories`, `budgets` ve `expenses` tabloları oluşturuldu.
- Her tabloda `auth.uid() = user_id` şartlı Row Level Security etkinleştirildi.
- Politikalar yalnızca `authenticated` rolüne erişim veriyor.
- Her tablo için `(user_id, updated_at)` sync index'i eklendi.
- `updated_at` değerini database saatinden üreten trigger'lar kuruldu.
- Push sırası kategori → bütçe → harcama olacak şekilde düzenlendi.
- Pull işlemi cursor ve sayfalama ile çalışıyor (`PAGE_SIZE = 1000`).
- Push başarısız olursa outbox satırı silinmiyor; sonraki sync'te tekrar deneniyor.
- GitHub Actions'a aşağıdaki repository secret'ları bağlandı:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Secret değerleri repoda veya bu dokümanda bulunmuyor.

### 3.2 Kimlik doğrulama

İlk tasarım anonim oturum ve sonradan recovery e-postası ekleme üzerineydi. Bu
yaklaşım daha sonra bilinçli olarak kaldırıldı ve kalıcı e-posta login sistemine
geçildi.

Mevcut davranış:

- Yeni cihazda Supabase e-posta/parola login ekranı gösterilir.
- Başarılı session `localStorage` içinde `zero.auth` anahtarıyla saklanır.
- Session uygulama her açıldığında yeniden login istemez.
- Refresh token otomatik yenilenir.
- Log out yalnızca mevcut cihazın session'ını kapatır (`scope: 'local'`).
- Log out öncesinde uygulama içinde “Are you sure?” onayı gösterilir.
- Sync sırasında veya bekleyen outbox kaydı varken logout butonu devre dışıdır.
- Activity ve Budgets başlıklarındaki küçük nokta sync durumunu gösterir.
- Settings ekranında hesap e-postası ve daha ayrıntılı sync durumu gösterilir.
- “Sync now” butonunun görünürlüğü artırıldı.

Supabase dashboard'da yapılan güvenlik ayarları:

- `Allow new users to sign up`: kapalı
- `Allow anonymous sign-ins`: kapalı
- E-posta provider: açık
- Diğer provider'lar: kapalı
- Temizlik anında bir adet e-posta kullanıcısı bırakıldı.
- Temizlik anında anonim auth kullanıcısı sayısı `0` olarak doğrulandı.

Sonuç olarak uygulamanın linkini bulan biri yeni hesap oluşturamaz. Geçerli
hesabı bilmeden oturum açamaz; RLS nedeniyle tablo satırlarını okuyamaz veya
değiştiremez.

### 3.3 Supabase dummy veri temizliği

Kullanıcının açık onayıyla şu bulut verileri transaction içinde silindi:

- 19 expense
- 1 budget
- 0 category
- 1 anonim auth kullanıcısı

İşlemden hemen sonra doğrulanan sayaçlar:

- `auth_users_total = 1`
- `auth_users_with_email = 1`
- `auth_anonymous = 0`
- `budgets = 0`
- `expenses = 0`
- `categories = 0`

Tablolar, trigger'lar, index'ler ve RLS politikaları silinmedi.

Önemli: Bu işlem iPhone'daki IndexedDB verisini silmedi. Yerel dummy kayıtlar
daha sonra değiştirilirse, restore edilirse veya outbox'ta bekliyorsa tekrar
Supabase'e gönderilebilir. Yukarıdaki sayaçlar yalnızca temizlik işleminin hemen
sonrasındaki doğrulanmış durumdur; güncel bulut sayacı olarak kabul edilmemelidir.

### 3.4 iOS 27 PWA hizalama çalışması

Ana Ekran'a “Open as Web App” seçeneğiyle eklenen uygulamada iOS'un üst
scroll-edge gölgesi Activity/Budgets başlığı ile Settings ikonunun üzerine
düşüyordu. Safari sekmesindeki görünüm ile standalone PWA geometrisi farklıydı.

Uygulanan çözüm:

- Standalone mod şu iki sinyalle algılanıyor:
  - `matchMedia('(display-mode: standalone)')`
  - `navigator.standalone`
- Standalone olduğunda `<html>` elementine `standalone-web-app` class'ı ekleniyor.
- iOS 27 ve kırpılmış viewport geometrisinde ayrıca
  `ios-clipped-standalone` class'ı ekleniyor.
- Üst header yalnızca standalone modda ek safe-area payı alıyor.
- Mevcut son değer:

  ```css
  .standalone-web-app .app-header.safe-top.pt-3 {
    padding-top: calc(env(safe-area-inset-top, 0px) + 1.75rem);
  }
  ```

- Bu değer birçok gerçek cihaz ekran görüntüsü üzerinden piksel piksel ayarlandı.
- Son iterasyonda gölgeyi temizlemek için önce 3 CSS px, ardından son 1 CSS px
  aşağı hareket uygulandı.
- Alt tab bar için iOS 27'nin safe-area'yı iki kez ayırdığı geometride özel
  `ios-clipped-standalone` düzeltmesi bulunuyor.
- Safari'nin normal browser görünümünün safe-area davranışı değiştirilmedi.

Bu bölüm cihaz ve beta iOS sürümüne çok duyarlıdır. İleride değiştirilirse hem
Safari sekmesinde hem de mevcut Ana Ekran PWA'sında gerçek cihaz testi yapılmalı.

### 3.5 Küçük UX geliştirmeleri

- Expense detayında Delete artık ikinci bir onay istemeden tek dokunuşta siliyor.
- Log out için tersine, yanlışlıkla çıkışı engelleyen inline onay eklendi.
- Sync durum noktası minimal biçimde Activity ve Budgets başlıklarına eklendi.
- Settings içindeki hesap/sync kartları sadeleştirildi.
- `Sync now` kontrastı yükseltildi.
- Henüz başlamamış (`Not started`) bütçelerde de günlük harcama limiti
  gösteriliyor.
- Upcoming budget daily allowance hesabı unit test ile güvenceye alındı.

### 3.6 CI ve deployment

- Eksik `@types/node` doğrudan dev dependency olarak eklendi; temiz `npm ci`
  ortamındaki TypeScript build hatası giderildi.
- Her `main` push'unda GitHub Actions şunları çalıştırıyor:
  1. `npm ci`
  2. `npm run test`
  3. `npm run build`
  4. GitHub Pages artifact upload/deploy
- Build sırasında `BASE_PATH=/zero-budget/` kullanılıyor.
- PWA `registerType: 'autoUpdate'` ile yeni service worker'ı otomatik alıyor.
- Mevcut Ana Ekran ikonu için uygulamayı silip yeniden eklemek gerekmez. Bazı
  iOS sürümlerinde yeni worker'ın görünmesi için uygulamayı tamamen kapatıp bir
  veya iki kez yeniden açmak gerekebilir.

## 4. Mevcut veri ve sync mimarisi

### Yerel yazma

Tüm mutation'lar `src/db/mutations.ts` içinden geçer. Veri satırı ve outbox
kaydı aynı Dexie transaction'ında yazılır. Böylece “ekranda kaydedildi ama sync
kuyruğuna hiç girmedi” durumu engellenir.

### Push

- Outbox sıra numarasıyla okunur.
- Aynı satır için yalnızca bir bekleyen outbox kaydı tutulur.
- Satırın en güncel yerel hali Supabase'e `upsert` edilir.
- Supabase kabul etmezse hata yakalanır ve outbox korunur.
- Başarılı satırlar outbox'tan kaldırılır.

### Pull

- Her tablo için ayrı `syncCursor:<table>` değeri tutulur.
- Sunucuda cursor'dan yeni `updated_at` değerleri çekilir.
- Yerelde pending değişikliği olan satır pull tarafından ezilmez.
- `updated_at` Supabase trigger'ı tarafından üretildiği için cihaz saatleri
  sıralama kaynağı değildir.

### Çakışma davranışı

Pratik model last-write-wins'dir. İki cihaz aynı kaydı değiştirirse Supabase'e
en son ulaşan değişiklik geçerli olur. Kullanıcıya conflict çözüm ekranı yoktur.

### Silme davranışı

Uygulama hard delete yerine `deleted = true` tombstone kullanır. Bunun nedeni,
bir cihazın sildiği kaydın başka bir cihazdaki eski kopyadan yeniden doğmasını
engellemektir.

Bu yüzden database'deki eski tombstone'lar zamanla birikebilir. Bunlar cihazların
cursor ve sync durumları dikkate alınmadan doğrudan cron ile silinmemelidir.

### Sync tetikleyicileri

Sync şu durumlarda çalışır:

- Uygulama başlangıcı
- Yerel mutation'dan yaklaşık 1.2 saniye sonra
- Cihaz tekrar online olduğunda
- Uygulama yeniden görünür/aktif olduğunda
- Her 5 dakikada bir
- Settings → `Sync now`

### Sync hata görünürlüğü

- Offline durumda yerel kullanım devam eder.
- Pending kayıt sayısı korunur.
- Durum noktası offline/error/syncing/idle renklerini gösterir.
- Settings “waiting”, “Retrying” veya son backup zamanını gösterir.
- Teknik hata mesajı engine içinde tutulsa da ana UI bunu ayrıntılı göstermiyor.
- Uzun süren sync arızası için güçlü banner veya bildirim henüz yoktur.

## 5. Supabase kapasite ve veri kaybı değerlendirmesi

Tek kullanıcılı bu uygulama için Free/Nano compute performansı ve 500 MB
database kotası şu anda acil bir risk değildir. On binlerce küçük expense satırı
bile bu sınıra yaklaşmadan uzun süre çalışabilir.

Asıl risk kapasiteden çok backup politikasındadır:

- Free projelerde otomatik indirilebilir günlük backup garantisi yoktur.
- Free proje düşük aktivite nedeniyle yaklaşık 7 gün sonra pause edilebilir.
- Pause veri silme değildir; dashboard'dan resume edilebilir.
- 500 MB database kotası aşılırsa proje read-only moda girebilir.
- Supabase dolunca otomatik olarak “en eski satırı sil” davranışı uygulamaz.
- Supabase Cron ile retention job yazılabilir, fakat bu projede henüz
  etkinleştirilmedi ve şu aşamada önerilmedi.

İlgili resmi belgeler:

- <https://supabase.com/pricing>
- <https://supabase.com/docs/guides/platform/database-size>
- <https://supabase.com/docs/guides/platform/backups>
- <https://supabase.com/docs/guides/platform/free-project-pausing>
- <https://supabase.com/docs/guides/cron>

Kullanıcı için manuel JSON export/restore mevcut:

- Settings → `Export a backup file`
- Settings → `Restore from a backup`
- Format düz JSON'dur ve Supabase'den bağımsızdır.
- Restore, ID ve `updatedAt` üzerinden merge eder; daha yeni yerel satırı eski
  backup ile ezmez.
- Restore edilen kayıtlar yeniden buluta gönderilmek üzere outbox'a eklenir.

## 6. Bilinen riskler ve açık işler

### Yüksek öncelik

1. **Otomatik harici backup yok.** Uzun yıllar kullanım hedefi için haftalık
   veya aylık Supabase dump'ının Supabase dışındaki bir konuma şifreli olarak
   alınması önerilir.
2. **Sync arızası yeterince belirgin değil.** Saatler/günler süren pending veya
   error durumu için görünür bir uyarı ve gerçek hata detayı eklenebilir.

### Orta öncelik

3. **`README.md` güncel değil.** Hâlâ anonim giriş ve recovery email mimarisini
   anlatıyor. Mevcut zorunlu e-posta login modeline göre düzeltilmeli.
4. **Tombstone retention tasarımı yok.** Database gerçekten büyürse eski
   tombstone'ları güvenle temizlemek için cihaz-aware bir protokol gerekir.
5. **Kapasite alarmı yok.** Database boyutu belirli eşiklere ulaştığında haber
   veren bir kontrol eklenebilir; şu anda acil değildir.

### Düşük öncelik

6. iOS 27 beta standalone safe-area çözümü gerçek cihaz görüntülerine göre
   ayarlandı; farklı iPhone/iOS sürümlerinde otomatik görsel test yoktur.
7. Sync conflict ekranı yoktur; tek kullanıcı ve az cihaz varsayımıyla
   last-write-wins kullanılır.

## 7. Geliştirme ve doğrulama komutları

Kurulum:

```bash
npm ci
cp .env.example .env.local
```

`.env.local` içine Supabase project URL ve anon/publishable key girilir. Bu
dosya commit edilmemelidir.

Yerel geliştirme:

```bash
npm run dev
```

Vite LAN'a bind edildiği için aynı Wi-Fi'daki iPhone üzerinden de açılabilir.

Tam doğrulama:

```bash
npm run typecheck
npm test
BASE_PATH=/zero-budget/ npm run build
```

Son doğrulanan test durumu:

- 1 test dosyası
- 11 test
- Typecheck başarılı
- Production build başarılı
- GitHub Pages deploy başarılı

## 8. Önemli dosyalar

- `src/App.tsx` — auth gate ve ana uygulama state'i
- `src/main.tsx` — startup, seed, recurring budget roll, standalone iOS tespiti
- `src/index.css` — tema, safe-area ve iOS 27 PWA düzeltmeleri
- `src/db/schema.ts` — Dexie şeması
- `src/db/mutations.ts` — yerel mutation + outbox transaction'ları
- `src/db/queries.ts` — reactive yerel sorgular
- `src/sync/client.ts` — Supabase client/session ayarları
- `src/sync/auth.ts` — login/logout
- `src/sync/engine.ts` — push/pull/cursor/retry davranışı
- `src/sync/backup.ts` — JSON export/restore
- `src/sync/useSyncStatus.ts` — kullanıcıya gösterilen sync açıklamaları
- `src/screens/Login.tsx` — e-posta/parola login ekranı
- `src/screens/SettingsSheet.tsx` — hesap, sync, logout ve backup kontrolleri
- `src/components/SyncDot.tsx` — minimal sync göstergesi
- `src/lib/budget.ts` — günlük limit ve bütçe durumu hesapları
- `supabase/schema.sql` — production database şeması, trigger ve RLS
- `.github/workflows/deploy.yml` — CI ve GitHub Pages deployment

## 9. Codex oturumundaki commit özeti

Supabase devralımından itibaren önemli commit'ler:

```text
b199a9c Complete Supabase sync setup
a7920cd Add recovery sign-in for new devices
9bb3df4 Fix iPhone PWA safe-area alignment
89b5f9c Fix iOS standalone viewport alignment
edb5673 Work around iOS 27 PWA bottom inset
240d49f Fine-tune iOS 27 PWA alignment
bbb5a3d Fix iOS PWA edges and simplify expense deletion
afcdbb1 Move iOS PWA headers below system shadow
f7841b8 Add persistent login and signed-in sync status
aaa7c2f Probe iOS standalone top inset and add logout
75a23cb Tune iOS standalone header clearance
e3a29e8 Confirm logout and improve sync action contrast
bd9c6d5 Place iOS PWA header just below system shadow
8ddc2c6 Tighten iOS PWA top clearance
85bd4ac Finalize iOS PWA header spacing
c68c8c5 Raise iOS PWA header slightly
3f144af Show daily limit for upcoming budgets
5b50ab4 Nudge iOS PWA header below shadow
c607083 Lower iOS PWA header by three pixels
9cd2a5f Finalize iOS PWA shadow clearance
```

`a7920cd` içindeki recovery yaklaşımı daha sonra `f7841b8` ile kalıcı login
mimarisine dönüştürülmüştür. Commit geçmişi debugging için korunmuştur; güncel
davranış için her zaman `main` branch'indeki kod esas alınmalıdır.

## 10. Devralacak kişi için kısa kontrol listesi

1. Önce bu dosyayı, ardından güncel kodu okuyun.
2. `README.md` içindeki anonim auth açıklamalarını güncel davranış sanmayın.
3. Supabase şemasını yeniden çalıştırmadan önce production durumunu kontrol edin.
4. RLS'yi veya signup ayarını açmayın; uygulama bilinçli olarak tek hesaplıdır.
5. Cloud verisini hard-delete etmeden önce yerel cihazların aynı veriyi yeniden
   gönderebileceğini hesaba katın.
6. Safe-area CSS'sini değiştirirseniz gerçek iPhone standalone modunda test edin.
7. Her değişiklikten sonra typecheck, test, production build ve Pages deploy'u
   doğrulayın.

