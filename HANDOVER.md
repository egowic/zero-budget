# Zero Budget — Web/PWA + Native iOS Birleşik Handover

Son güncelleme: 14 Ağustos 2026

Aktif branch'ler: Her iki bağımsız repoda da `main`

Bu güncelleme öncesindeki son commit'ler:

- Web/PWA repo: `3304aa0 Document category selection fix`
- Native iOS repo: `94c68e4 Configure Personal Team device signing`

Bu dosya, projenin Claude Code ile başlayan ilk geliştirme aşamasından sonra
Codex ile devam eden oturumda yapılan işleri ve mevcut teknik durumu devralacak
kişiye aktarmak için hazırlanmıştır. Artık birbiriyle görsel/işlevsel akraba,
ancak veri ve deployment bakımından tamamen ayrı iki uygulama vardır. Gizli
anahtarlar ve kullanıcı parolaları bilerek bu dosyaya dahil edilmemiştir.

## 0. En önemli ayrım: iki bağımsız uygulama ve iki bağımsız repo

### A. Production web/PWA

- Lokal repo: `/Users/egowic/Repos/Project Zero`
- GitHub: <https://github.com/egowic/zero-budget>
- Canlı uygulama: <https://egowic.github.io/zero-budget/>
- Veri: local-first IndexedDB + Supabase sync/backup
- Auth: tek e-posta hesabı; public signup ve anonymous sign-in kapalı
- Dağıtım: GitHub Pages + GitHub Actions
- Ana Ekran kurulumu: Safari'den “Open as Web App”

### B. Ayrı native iOS uygulaması

- Lokal repo: `/Users/egowic/Xcode/ZeroBudget`
- Xcode projesi:
  `/Users/egowic/Xcode/ZeroBudget/ios/App/App.xcodeproj`
- Kullanıcıya görünen ad: `ZeroBudget`
- Bundle identifier: `com.egowic.zerobudget.egebilir`
- Veri: yalnızca native app konteynerindeki local IndexedDB
- Supabase/auth/sync/recovery/cloud backup: yok
- Dağıtım: ücretsiz Apple Personal Team ile doğrudan iPhone'a yükleme
- GitHub remote/App Store/TestFlight: yok

Bu iki repo birbirini otomatik güncellemez. Web repo GitHub'a push edilince PWA
güncellenir; native iOS uygulaması güncellenmez. Ortak bir UI/iş mantığı değişikliği
iki uygulamada da isteniyorsa değişiklik iki kod tabanına bilinçli olarak port
edilmeli, native tarafta `npm run native:sync` çalıştırılmalı ve `.app` yeniden
build/install edilmelidir.

Native uygulama web/PWA verisini import etmez, Supabase'e bağlanmaz ve mevcut
PWA hesabını kullanmaz. İki uygulamanın IndexedDB alanları da ayrıdır.

## 1. Production web/PWA özeti

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
- Üç tabloda primary key `(user_id, id)` bileşiği olarak düzenlendi; aynı sabit
  built-in category ID'leri farklı kullanıcılar için çakışmadan var olabiliyordu.
- Push `upsert` işlemi açıkça `onConflict: 'user_id,id'` kullanacak şekilde
  düzeltildi.
- `updated_at` değerini database saatinden üreten trigger'lar kuruldu.
- Push sırası kategori → bütçe → harcama olacak şekilde düzenlendi.
- Pull işlemi cursor ve sayfalama ile çalışıyor (`PAGE_SIZE = 1000`).
- Eski tek global sync cursor yerine her tablo için ayrı cursor kullanılıyor;
  böylece bir tablodaki ileri timestamp diğer tablonun satırlarını atlatmıyor.
- Pull sıralaması `updated_at`, ardından `id` ile deterministik hale getirildi.
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

### 3.7 Kategori sıralaması ve Activity bütçe yüzdesi

- Settings → Categories satırlarına iPhone dokunmatiğiyle çalışan sürükleme
  tutamaçları eklendi. Klavye erişilebilirliği için tutamaç odaktayken yukarı/aşağı
  ok tuşları da aynı sıralama işlemini yapar.
- Yeni sıra mevcut `Category.sortOrder` alanına yazılır; değişen kategori satırları
  aynı Dexie transaction'ında outbox'a eklenir ve Supabase'e senkron olur.
- Sıralama sorgusuna `sortOrder`, `createdAt`, `id` tie-break zinciri eklendi;
  eşit sıra değerlerinde dahi görünüm deterministiktir.
- Hem yeni expense hem mevcut expense düzenleme ekranı ortak `useCategories()`
  kaynağını kullandığından kategori grid'leri Settings'teki sırayı doğrudan izler.
- Dokuz built-in kategorinin silinme koruması aynen bırakıldı. Custom kategori
  ekleme ve yalnızca custom kategoriyi silme davranışı değişmedi.
- Dokuz built-in kategorinin isimleri de hem Categories arayüzünde hem mutation
  katmanında değiştirilemez. Custom kategoriler yeniden adlandırılabilir; built-in
  emoji düzenleme davranışı korunur.
- Activity ekranındaki ana budget kartına Budgets ekranıyla aynı harcanan yüzde
  etiketi eklendi. Yüzde formatı iki ekranda ortak `formatPercentUsed()` helper'ına
  bağlandı.
- Bu geliştirmeler yalnızca web/PWA reposuna yapıldı; ayrı native iOS repo bu
  iterasyonda değiştirilmedi.

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
e50f16f Update expense category selection immediately
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

## 11. Eksiksiz kronolojik oturum günlüğü

Bu bölüm yalnızca son teknik durumu değil, bu sohbet boyunca hangi sorunların
hangi sırayla konuşulduğunu, hangi varsayımların test edildiğini ve kararların
nasıl değiştiğini aktarır. Bir sonraki geliştiricinin eski bir yaklaşımı yanlışlıkla
geri getirmemesi için özellikle ayrıntılı tutulmuştur.

### 11.1 İlk devir ve Claude Code bağlamı

Kullanıcı projeye Claude Code ile başlamıştı ve uygulamanın çoğunluğu bitmişti.
Bu sohbete gelme nedeni Claude Code session limitinin dolması ve özellikle
Supabase/database bölümünün yarım kalmasıydı.

Kullanıcı ilk olarak kod yazılmadan repo ve önceki mesajların incelenmesini,
devam planının açıklanmasını, ardından gerekirse Supabase/GitHub giriş yetkisini
kendisinin tarayıcıda vermesini istedi. Safari ve Chrome'da gerekli hesaplara
giriş yaptı; production dashboard işlemleri bu açık oturum üzerinden yürütüldü.

Kullanıcının aktardığı Claude Code son mesajlarında şu süreç vardı:

1. Repo ve push yetkisi Claude Code tarafında vardı.
2. İlk anda `.github/workflows/*.yml` push'u için GitHub token'ında `workflow`
   scope sorunu olduğu düşünüldü ve kullanıcıya `gh auth refresh -h github.com
   -s workflow` önerildi.
3. Sonraki denemede push kendiliğinden geçti; workflow dosyası dahil beş commit
   GitHub'a ulaştı.
4. GitHub Pages kaynağı GitHub Actions olarak açıldı.
5. İlk temiz CI build'i `@types/node` eksikliğiyle hata verdi.
6. Lokal `tsconfig.node.tsbuildinfo` cache'i bu hatayı gizliyordu; temiz `npm ci`
   koşulunda eksik dependency ortaya çıktı.
7. `@types/node` eklenip temiz build/test doğrulandı ve Pages deploy başarılı oldu.
8. İlk canlı adres `https://egowic.github.io/zero-budget/` olarak açıldı.
9. Uygulama Safari → Share → Add to Home Screen akışıyla PWA olarak kurulabildi.
10. Service worker sayesinde uygulamanın offline açılması hedeflendi.
11. Canlı HTML ve manifest'in `/zero-budget/` base path altında doğru çözüldüğü
    kontrol edildi.
12. Supabase tarafında önceden bulunan “Portfolio” projesinin Zero ile
    karıştırılmaması gerektiği tespit edildi.
13. Dashboard ilk bakışta tek proje izlenimi verse de iki proje kartı bulundu.
14. İlk tahmin edilen organization slug'ına doğrudan gidildiğinde “You do not
    have access to this organization” hatası alındı; doğru dashboard linki/proje
    kartı üzerinden devam edildi.
15. Zero için ayrı Supabase projesi oluşturuldu.
16. Proje adı `zero`, Türkiye'ye yakın olduğu için bölge Central EU (Frankfurt),
    project ref
    `epjlcfvccbzxrakhheqq` oldu.
17. Güçlü database parolası kullanıldı ancak güvenlik nedeniyle repoya,
    handover'a veya sohbet özetine yazılmadı.
18. Create Project ekranındaki “Enable automatic RLS” seçeneğinin kapalı olması
    sorun sayılmadı; `schema.sql` her tabloda RLS'yi açıkça etkinleştirecek şekilde
    tasarlanmıştı.
19. Supabase form alanlarında browser extension/parola yöneticisi klavye
    simülasyonuyla çakıştığı için DOM tabanlı form doldurma kullanıldı.
20. SQL editörüne karakter karakter yazmak Monaco'nun otomatik parantez
    davranışı nedeniyle SQL'i bozuyordu; clipboard/paste yaklaşımına geçilmek
    üzereyken Claude Code limiti bitti.

Kullanıcı daha sonra hem Safari hem Chrome/Supabase oturumlarına giriş yaptı ve
gerekirse GitHub yetkisi verebileceğini belirtti. GitHub erişiminde ek bir kullanıcı
müdahalesine gerek kalmadı.

### 11.2 Önceliğin database'den iPhone hizalamasına çevrilmesi

Supabase çalışmasına devam edilmeden önce kullanıcı canlı PWA'daki görsel sorunu
öne aldı. İlk ekran görüntüsünde Ana Ekran'dan açılan uygulama yukarı kaymış,
Activity başlığı ve Settings ikonu iOS'un üst katmanı/gölgesi altında kalmıştı;
Settings butonuna basmak zorlaşıyordu.

Kullanıcının bu aşamadaki net ürün talimatları şunlardı:

- Genel UI zaten beğeniliyordu ve değiştirilmemeliydi.
- Yalnızca standalone PWA hizalama problemi çözülmeliydi.
- Uygulama ekranın altına doğru oturmalıydı.
- Safari browser görünümü ile Ana Ekran web-app görünümünün farkı dikkate
  alınmalıydı.

Bu kural sonraki tüm safe-area çalışmalarının sınırı oldu: yeni tasarım yapılmadı,
yalnızca platform geometrisi düzeltildi.

Kullanıcı birkaç kez database/login tarafında kendisi “okey” demeden ilerlenmemesini
özellikle istedi. Bu nedenle recovery, login ve retention başlıkları ara ara
konuşulsa da görsel hizalama önceliği korunup kapsam değişiklikleri açık onaydan
sonra yapıldı.

### 11.3 Yerel veri ile browser/PWA verisinin neden farklı göründüğü konuşması

Kullanıcı aynı URL'yi Safari'de sıfırdan açtığında “No budget” görürken Ana
Ekran'a eklenen uygulamada mevcut budget/expense verilerini görüyordu. Burada
şu davranış açıklandı:

- Uygulama local-first olduğu için ana veri kaynağı cihazdaki IndexedDB'dir.
- Safari sekmesi ile Ana Ekran standalone PWA'sı iOS'ta farklı storage context'i
  gibi davranabilir.
- Aynı URL'yi açmak, henüz ortak bir cloud identity ve tamamlanmış sync yoksa
  aynı IndexedDB verisini otomatik paylaşmak anlamına gelmez.
- Bu nedenle bir context'teki yerel veri diğerinde başlangıçta görünmeyebilir.
- Aynı e-posta hesabıyla login olup sync tamamlandıktan sonra iki context cloud
  üzerinden aynı verilere ulaşabilir.

Kullanıcı bunun Ana Ekran ikonunu yanlışlıkla kaldırırsa veri kaybı yaratabileceği
endişesini dile getirdi. Konuşulan çözüm katmanları:

1. Supabase cloud copy
2. Aynı hesaba yeniden login olabilme
3. Settings içindeki bağımsız JSON export/restore

İlk recovery-email yaklaşımı bu endişeyi azaltıyordu; daha sonra zorunlu ama
kalıcı e-posta login mimarisiyle konu daha net çözüldü.

### 11.4 Ana Ekran uygulamasının güncelleme davranışı

Kullanıcı her güncellemede uygulamayı Ana Ekran'dan silip yeniden eklemek gerekip
gerekmediğini sordu. Verilen ve test edilen cevap:

- Hayır, mevcut Ana Ekran PWA'sı aynı GitHub Pages adresini ve service worker'ı
  kullanır.
- Yeni deploy mevcut PWA'ya ulaşır.
- iOS cache/service-worker yaşam döngüsü nedeniyle uygulamayı tamamen kapatıp
  yeniden açmak gerekebilir.
- Bazen ikinci açılış yeni asset'leri gösterir.
- Yeniden “Add to Home Screen” yapmak normal güncelleme akışının parçası değildir.

Bu teori expense Delete değişikliğiyle pratikte test edildi: Kullanıcı Ana Ekran'a
önceden eklenmiş sürümde yeni tek-adımlı Delete davranışını gördü. Böylece eski
ikonun uygulama kodu güncellemelerini aldığı, kalıcı farkın yalnızca standalone
geometrisi olduğu doğrulandı.

### 11.5 iOS sürümü ve karşılaştırmalı ekran görüntüleri

Kullanıcı iOS 27 beta kullandığını belirtti. Safari browser ve standalone web-app
görüntüleri karşılaştırıldı:

- Safari'de header konumu daha normaldi.
- Standalone'da Dynamic Island/status-bar altındaki native scroll-edge gölgesi
  ilk kontrolleri etkiliyordu.
- Alt tab bar standalone modda gereğinden fazla yukarıda kalabiliyor ve altında
  boş alan oluşuyordu.
- Browser görünümünde Safari'nin kendi alt barı vardı; standalone görünümde bu
  alanın hesaplanışı farklıydı.

Bu nedenle çözüm global padding değişikliği olarak değil, standalone/iOS
geometrisine özel class'larla uygulandı.

### 11.6 Safe-area ve üst gölge iterasyonlarının tamamı

Hizalama tek denemede çözülmedi. Aşağıdaki deneyler ve sonuçları sırasıyla
uygulandı:

1. `safe-area-inset-top` ve `safe-area-inset-bottom` değerlerine `0px` fallback
   eklendi.
2. Tailwind'in `pt-3`, `pb-2`, `pb-4` utility'lerinin safe-area property'lerini
   ezmemesi için birleşik `calc(...)` kuralları yazıldı.
3. `apple-mobile-web-app-status-bar-style` önce `black-translucent` değerinden
   `black` değerine çevrilerek viewport davranışı test edildi.
4. iOS 27'nin alt alanı hem viewport dışında hem safe-area ile ayırdığı gözlemi
   üzerine `ios-clipped-standalone` tespiti eklendi.
5. Tespit için standalone mode, user-agent'tan iOS major version ve
   `screen.height - innerHeight >= 50` geometrisi kullanıldı.
6. `ios-clipped-standalone` altında bottom safe-area tekrarını kaldıran kurallar
   yazıldı.
7. Tab bar'a `app-tabbar` class'ı eklenip onun alt padding'i ayrıca düzeltildi.
8. Status-bar style tekrar `black-translucent` yapılıp sonuç karşılaştırıldı.
9. Daha sonra yeniden `black` kullanıldı; güncel değer `black` olarak kaldı.
10. iOS native scroll-edge efektini bastırmak için ekranın üstüne 1 px sabit,
    aynı renk bir `body::before` kenarı ekleme deneyi yapıldı.
11. Bu hile yeterli olmadığı için kaldırıldı.
12. Activity ve Budgets header'larına `app-header` class'ı eklendi.
13. Header'ı native gölgenin altına fiziksel olarak taşımak için standalone-only
    padding yaklaşımına geçildi.
14. İlk yaklaşım yalnızca `ios-clipped-standalone` class'ına bağlıydı; beta iOS
    user-agent/geometri tespitinin değişken davranabildiği görüldü.
15. Gerçek standalone sinyaline bağlı `standalone-web-app` class'ı ayrıca eklendi.
16. Çözüm branch'inin gerçekten çalıştığını kanıtlamak için kasıtlı olarak çok
    büyük `7rem` üst boşluk verildi.
17. Kullanıcının ekran görüntüsü header'ın çok aşağı taşındığını doğruladı; bu,
    doğru CSS dalına ulaşıldığının kanıtı oldu.
18. `7rem` değeri önce `4rem` değerine indirildi.
19. Sonra `2.5rem` değerine indirildi.
20. Sonra `1.75rem` değerine indirildi.
21. Bir ara hizalama iyi görünse de logout/login ve yeni render sonrasında boşluk
    yeniden farklı algılandı; değerler ekran görüntüleriyle tekrar ayarlandı.
22. `1.75rem → 1.625rem`: header biraz yukarı çekildi.
23. `1.625rem → 1.375rem`: daha görünür şekilde yukarı çekildi.
24. Günlük-limit geliştirmesiyle aynı commit'te `1.375rem → 1.4375rem`: tam
    1 CSS px aşağı alındı.
25. `1.4375rem → 1.5rem`: bir CSS px daha aşağı alındı.
26. Kullanıcı, gönderilen 945 × 2048 görselin web tarafında yaklaşık 393 × 852
    CSS px viewport'a karşılık geldiğini sordu/öğrendi. Bir CSS px'in ekran
    görüntüsünde yaklaşık 2.4 raster px göründüğü açıklandı.
27. Kullanıcının talebiyle `1.5rem → 1.6875rem`: tam 3 CSS px aşağı alındı.
28. Son talep üzerine `1.6875rem → 1.75rem`: son 1 CSS px aşağı alındı.

Güncel ve kullanıcı tarafından “bu şekilde kapatılacak” olarak hedeflenen değer
yeniden `1.75rem` oldu. Bu sayının daha önce de denenmiş olması çelişki değildir;
arada standalone class tespiti ve diğer safe-area kuralları değişmiştir. Yalnızca
sayısal değeri eski commit'lerle karşılaştırmak yeterli değildir.

### 11.7 Database retention fikrinin ilk konuşulması

Kullanıcı Supabase ücretsiz planının dolabileceğini, tabloların sürekli
büyüyeceğini ve eski aylara çok sık bakmadığını belirtti. Bu aşamada özellikle
kod yazılmaması, yalnızca fikir verilmesi istendi.

Konuşulan seçenekler:

- Eski expense kayıtlarını belirli aralıklarla silmek
- Yalnızca son birkaç ayı ayrıntılı tutmak
- Eski ayların önemli bilgilerini/özetlerini korumak
- Supabase'in dolarken otomatik oldest-first cleanup yapıp yapamayacağı
- Zamanlanmış cleanup/retention job kullanmak

İlk karar uygulama yapmamak oldu. Gerekçeler:

- Tek kullanıcı verisi 500 MB'a çok yavaş yaklaşır.
- Ham finansal veriyi erken silmek geri dönüşsüzdür.
- Tombstone kullanan sync tasarımında server'dan hard-delete edilen satır eski
  cihazdan yeniden doğabilir.
- Önce backup ve güvenli retention protokolü tasarlanmalıdır.

### 11.8 Recovery yaklaşımından kalıcı login yaklaşımına geçiş

Supabase'in ilk tamamlandığı aşamada anonim auth hâlâ vardı; ancak yalnızca canlı
URL'yi ziyaret etmek anonim kullanıcı oluşturmuyordu. Önce mevcut session aranıyor,
yalnızca gerçek bir local mutation outbox'a girdiyse `ensureSession()` ile anonim
identity oluşturuluyordu. Bu, linki meraktan açan kişilerin gereksiz auth user
üretmesini önlüyordu.

İlk etapta Settings içinden mevcut anonim hesabı e-posta/parola ile recovery
edilebilir hale getiren bir akış geliştirildi. Kullanıcı recovery özelliğini
denediğini ve çalıştığını söyledi; her açılışta login istemediğini gözlemledi.

Daha sonra kullanıcı şu ürün kararını önerdi:

- Zaten bir hesap altyapısı varsa net bir login ekranı olsun.
- Her açılışta login istemesin; session kalıcı olsun.
- Yerel veri korunurken aynı e-posta hesabıyla sync devam etsin.
- Recovery mi, login mi belirsizliği ortadan kalksın.
- Login/sync durumunu gösteren minimal yeşil bir nokta olsun.
- Settings'teki mevcut yeşil sync sunumu bozulmasın.
- Activity ve Budgets ekranlarında da küçük status göstergesi olsun.

Önce yaklaşım konuşuldu, kullanıcı “okey” dedikten sonra implementasyona geçildi.

Son mimari:

- Anonymous identity oluşturma kaldırıldı.
- Session yoksa `Login` ekranı gösteriliyor.
- Email/password ile `signInWithPassword` kullanılıyor.
- Session persist ve token refresh açık.
- Login'den sonra local-first sync başlıyor.
- Ana ekranlarda `SyncDot`, Settings'te ayrıntılı status bulunuyor.
- Yeşil nokta “signed in + idle/backed up” durumunu, diğer renkler syncing,
  offline veya error durumlarını temsil ediyor.

### 11.9 Logout ve Sync now iyileştirmeleri

Kullanıcı Settings'te logout seçeneği istedi. Logout eklendikten sonra ilk hali
tek dokunuşla çıkış yapıyordu. Kullanıcı yanlışlıkla çıkışı önlemek için onay
istedi ve ayrıca `Sync now` yazısının çok silik olduğunu belirtti.

Uygulanan sonuç:

- İlk `Log out` dokunuşu inline “Are you sure?” alanını açar.
- `Cancel` ve kesin `Log out` seçenekleri gösterilir.
- İşlem sırasında “Logging out…” görünür.
- Sync devam ederken veya pending varken logout engellenir.
- Logout yalnızca bu cihazdaki session'ı kapatır; diğer cihazları kapatmaz.
- `Sync now` boyutu korunup kontrastı artırıldı.

Kullanıcının bir mesajındaki “logo ad” ifadesi bağlam içinde “log out” talebi
olarak yorumlandı ve hesap kartına logout seçeneği eklendi; yeni bir logo/branding
özelliği yapılmadı.

### 11.10 Expense Delete davranışı

Başlangıçta expense detayında Delete'e basınca ikinci bir “emin misin?” adımı
vardı. Kullanıcı bunun gereksiz olduğunu ve ilk Delete dokunuşunda silinmesini
istedi.

- İkinci confirmation state/UI kaldırıldı.
- Delete tek dokunuşta `deleteExpense` çağırıyor.
- Gerçek veri hard-delete edilmez; local row `deleted = 1` tombstone olur ve
  outbox üzerinden Supabase'e sync edilir.
- Bu değişikliğin mevcut Ana Ekran PWA'sına ulaşması, service-worker update
  davranışını doğrulamak için de kullanıldı.

### 11.11 “Not started” bütçede günlük limit

Kullanıcı henüz başlamamış bir budget kartında `Not started` görünürken günlük
harcama tutarının gizlenmemesini istedi.

Önceden Budgets listesindeki günlük-limit alt satırı yalnızca `phase ===
'active'` iken render ediliyordu. Bu koşul `phase !== 'ended'` olarak değiştirildi.

Sonuç:

- Upcoming budget için `amount / toplam gün` mantığındaki allowance gösterilir.
- “Not started” etiketi korunur.
- Bitiş tarihi geçmiş budget'ta bu satır gösterilmez.
- Örnek testte ₺19.000 / 31 gün için upcoming allowance'ın minor unit değeri
  `61_200` (₺612) olarak doğrulandı.

### 11.12 Tek hesap güvenliği konuşması ve Supabase denetimi

Kullanıcı linki bulan başka birinin hesap açamamasını, hiçbir veriyi görmemesini
ve yalnızca kendi tek hesabının kalmasını istedi.

Kod veya varsayım üzerinden cevap vermek yerine Supabase dashboard ve SQL ile
doğrudan production denetimi yapıldı:

- Auth user toplamı sorgulandı.
- E-posta kullanıcısı ve anonim kullanıcı ayrı sayıldı.
- `budgets`, `expenses`, `categories` satır sayıları sorgulandı.
- `pg_policies` üzerinden üç tablonun RLS policy'leri okundu.
- Her policy'nin `authenticated` rolü ve `auth.uid() = user_id` koşulu kullandığı
  doğrulandı.
- Dashboard → Authentication → Sign In / Providers ekranında yeni signup ve
  anonymous sign-in switch'leri kapatıldı.
- Email provider açık bırakıldı.

Bu ayar sonrası yeni ziyaretçi signup yapamaz. Public anon/publishable key'in
frontend bundle'da bulunması normaldir; veri güvenliğini gizli frontend key değil,
RLS sağlar. `service_role` key hiçbir zaman frontend'e konmamalıdır.

### 11.13 Dummy cloud verisinin silinmesi

Kullanıcı o ana kadar girilmiş verilerin tamamının dummy olduğunu açıkça onayladı
ve tabloları uçurmadan yalnızca içlerini temizlemeyi istedi.

Silmeden önce tespit edilen production durumu:

- 2 auth user: 1 e-posta, 1 anonim
- 1 budget
- 19 expense
- 0 category

Onay sonrası tek transaction içinde:

1. `public.expenses` satırları silindi.
2. `public.budgets` satırları silindi.
3. `public.categories` satırları silindi.
4. `auth.users` içindeki yalnızca `is_anonymous = true` kullanıcı silindi.
5. Transaction commit edildi.

Supabase SQL Editor destructive-query uyarısı gösterdi; kullanıcının açık onayı
zaten bulunduğu için “Run query” ile devam edildi.

Son doğrulama query'si 6 satır döndürdü:

- anonymous user `0`
- total auth user `1`
- email auth user `1`
- budgets `0`
- categories `0`
- expenses `0`

Bu işlem schema, tables, indexes, functions, triggers veya RLS policies üzerinde
destructive değişiklik yapmadı.

### 11.14 Supabase Nano limitleri, sync hataları ve uzun yıllar kullanım konuşması

Kullanıcı daha sonra konuya tekrar dönerek üç ana endişeyi sordu:

1. Nano compute ve Free plan bottleneck/limitleri
2. Database'in yıllar içinde şişmesi ve otomatik oldest-first silme
3. Sync hatası veya Supabase limiti nedeniyle uzun vadeli data loss

Bu aşamada kod yazılmadı. Güncel resmi Supabase belgeleri araştırıldı ve mevcut
sync engine kodu satır satır incelendi.

Konuşmada aktarılan Free plan bağlamı:

- Nano shared CPU
- Yaklaşık 0.5 GB RAM
- Proje başına 500 MB database limiti
- 5 GB aylık egress
- 50.000 MAU; tek kullanıcı için ilgisiz derecede yüksek
- Düşük aktivitede yaklaşık 7 gün sonra free project pause ihtimali
- 500 MB aşımında read-only davranışı/fair-use restriction ihtimali
- Free planda otomatik indirilebilir günlük backup olmaması
- Pro planın o tarihte yaklaşık $25/ay ve 7 günlük daily backup sunması
- PITR'nin ayrı ve çok daha pahalı bir add-on olması

Varılan sonuç:

- Tek kullanıcının küçük budget/expense satırları için Nano compute bottleneck
  değildir.
- Günde 10 expense ile 10 yılda yaklaşık 36.500 expense oluşur; bunun 500 MB'a
  yaklaşması beklenmez.
- Bu proje için yakın risk kapasite değil, bağımsız otomatik backup eksikliğidir.
- Supabase dolunca kendi kendine en eski satırı silmez.
- `pg_cron` ile scheduled delete teknik olarak mümkündür ama uygulanmadı.
- Database gerçekten büyürse önce eski ayların özetlenmesi, export alınması ve
  yalnız güvenli tombstone'ların temizlenmesi düşünülmelidir.

Sync kodundan doğrulanan hata davranışı:

- Her veri önce telefona yazılır.
- Veri ve outbox aynı transaction'dadır.
- Network/Supabase hatasında outbox korunur.
- Offline, app focus, online dönüşü, mutation, 5 dakikalık timer ve `Sync now`
  yeniden deneme sağlar.
- Supabase read-only olursa upsert hata verir; local row ve outbox kaybolmaz.
- UI kırmızı/farklı renk status ve “Retrying/waiting” gösterir.
- Gerçek hata metni kullanıcıya yeterince görünür değildir.
- Cloud'a ulaşmamış pending veri varken cihaz/app storage tamamen silinirse o
  pending veri kurtarılamaz.
- İki cihaz aynı satırı değiştirirse conflict UI yoktur; last-write-wins işler.

Uzun vadeli öneri olarak kapasite upgrade'i yerine şu sıra önerildi:

1. Nano'da kalmak
2. Otomatik eski-veri silmeyi şimdilik yapmamak
3. Database boyutunu dönemsel izlemek
4. Uzun sync hatasını daha görünür yapmak
5. Supabase dışına düzenli, mümkünse şifreli backup almak
6. Manuel JSON export'u iCloud Drive gibi bağımsız bir yerde tutmak
7. Pro'ya kapasite için değil, pause olmaması ve otomatik backup değerliyse geçmek

Kullanıcı bu değerlendirmeyi mantıklı buldu ve database tarafında acil geliştirme
olmadığını, mevcut kullanım modeliyle yıllarca devam edebileceğini kabul etti.

### 11.15 Her iterasyondaki doğrulama ve deployment davranışı

Uygulama kodu değişen her iterasyonda genel olarak şu kontroller çalıştırıldı:

```bash
git diff --check
npm run typecheck
npm test
BASE_PATH=/zero-budget/ npm run build
```

Ardından değişiklik `main` branch'ine commit/push edildi ve GitHub Actions Pages
run'ı tamamlanana kadar izlendi. Canlı HTML'den güncel hashed CSS asset'i bulunup
beklenen safe-area değerinin gerçekten yayınlandığı ayrıca kontrol edildi.

CI run'larında uygulama test/build/deploy işlemleri başarılıydı. GitHub Actions
annotation olarak `actions/checkout@v4`, `actions/setup-node@v4` ve bazı artifact
action'larının eski Node 20 runtime hedefi nedeniyle Node 24'e zorlandığı uyarısını
gösterdi. Bu bir deployment hatası değildir; ileride action major sürümleri
güncellenince temizlenebilir.

### 11.16 Login süresi ve expense kategori seçimindeki son düzeltme

Handover'ın ilk sürümünden sonra kullanıcı iki ek konu sordu.

İlk konu, Ana Ekran PWA'sının ne zaman tekrar login isteyeceğiydi. Açıklanan
davranış:

- Supabase access token kısa ömürlü olsa da refresh token otomatik yenilenir.
- Session `zero.auth` storage key'iyle cihazda kalıcıdır.
- Normal günlük kullanımda her açılışta veya belirli kısa bir aralıkta login
  beklenmez; haftalar/aylar boyunca açık kalabilir.
- Kesin bir “şu tarihte yeniden login” süresi verilmez.
- Kullanıcı logout yaparsa, iOS/site storage'ı temizlenirse, Ana Ekran web-app
  storage'ı silinirse, Supabase refresh token/session'ı güvenlik nedeniyle iptal
  edilirse veya auth ayarlarında session'ları geçersizleştiren değişiklik yapılırsa
  yeniden login gerekir.

İkinci konu, var olan bir expense'in kategorisini değiştirme ekranındaki görsel
gecikmeydi. Örneğin Dining Out seçiliyken Takeaway'e dokunulduğunda database ve
timeline doğru güncelleniyor, fakat detay grid'indeki Takeaway logosu hemen seçili
görünmüyor veya ancak daha sonra/reopen sonrasında yanıyordu.

Kök neden:

- Timeline satırına dokunulduğunda `ExpenseDetailSheet` bileşenine expense'in o
  andaki object snapshot'ı veriliyordu.
- `updateExpense` IndexedDB'yi doğru güncelliyordu.
- Timeline'ın live query'si yenilense bile açık sheet'in `selected` state'inde
  tutulan object eski `categoryId` değerini taşımaya devam ediyordu.
- `CategoryGrid.selectedId` bu eski snapshot'tan beslendiği için seçili ikon
  görsel olarak gecikiyordu.

`e50f16f Update expense category selection immediately` commit'iyle:

- Sheet içinde ayrı `selectedCategoryId` UI state'i eklendi.
- Yeni kategoriye dokunur dokunmaz bu state optimistik olarak değiştiriliyor.
- `CategoryGrid` seçili ikonunu bu anlık state'ten okuyor.
- Aynı anda `updateExpense` ile IndexedDB/outbox kaydı devam ediyor.
- Nadir bir local write hatasında seçim önceki kategoriye geri dönüyor.
- Başka veya yenilenmiş expense açıldığında state prop'taki güncel kategoriye
  reset ediliyor.
- Başka UI veya category davranışı değiştirilmedi.
- Typecheck, 11 unit test ve production build başarılı tamamlandı.

### 11.17 Kategori sırası ve Activity yüzdesi

Kullanıcı, Settings'teki mevcut kategorilerin silinmemesini, ancak sıralarının
değiştirilebilmesini; expense girerken çıkan kategori grid'inin de aynı sırayı
kullanmasını istedi. Var olan modelde kategori başına tek kez saklanan `icon`,
`name`, `color` ve `sortOrder` alanlarının bulunduğu; expense satırının bunları
tekrar yazmak yerine yalnızca `categoryId` tuttuğu açıklandı.

Mevcut `sortOrder` alanının Supabase `categories.sort_order` kolonuyla push ve pull
yönlerinde zaten eşlendiği doğrulandı. Yeni migration açmadan, iOS dokunmatiğine
uygun pointer-capture tabanlı sürükleme tutamacı ve outbox'a dahil kalıcı reorder
mutation'ı eklendi. Built-in silme yasağı ile custom ekleme/silme davranışı korundu.

Aynı istekte Budgets kartında bulunan harcanan yüzde bilgisinin Activity'deki ana
budget kartında da gösterilmesi istendi. Activity kartında spent/total satırının
sağına aynı renk ve formatta yüzde eklendi; iki ekran ortak formatter kullanıyor.
Native iOS repo bu değişikliklerin kapsamı dışında bırakıldı.

## 12. Konuşulan fakat bilinçli olarak uygulanmayan işler

Aşağıdaki fikirler unutulmuş değildir; konuşulup ertelenmiştir:

1. **Otomatik eski expense silme:** Yakın kapasite ihtiyacı olmadığı ve sync
   resurrection/tombstone riski bulunduğu için yapılmadı.
2. **Aylık özet + ham veri retention:** Gelecekte database gerçekten büyürse
   değerlendirilecek bir tasarım fikri olarak kaldı.
3. **Supabase Cron cleanup:** Teknik olarak mümkün olduğu doğrulandı fakat job
   oluşturulmadı.
4. **Pro/PITR upgrade:** Şu an gerekli görülmedi. Pro ancak backup/pause garantisi
   için değerli olabilir; PITR bu kişisel proje için pahalı bulundu.
5. **Otomatik harici backup workflow'u:** En değerli sonraki güvenlik işi olarak
   tanımlandı fakat kullanıcı bu oturumda implementasyon istemedi.
6. **Güçlü sync-error banner/notification:** Eksik olduğu tespit edildi fakat
   henüz yapılmadı.
7. **Conflict resolution UI:** Tek kullanıcı/az cihaz varsayımı nedeniyle
   last-write-wins korunuyor.
8. **Ana UI redesign:** Kullanıcı açıkça UI'ye dokunulmamasını istedi; yapılmadı.
9. **Her update'te PWA'yı yeniden kurma:** Gerekli olmadığı testle doğrulandı;
   böyle bir akış eklenmedi.
10. **Public signup:** Bilinçli olarak kapalı tutuldu; uygulamanın çok-kullanıcılı
    ürüne dönüştürülmesi istenmiyor.

## 13. Ürün kararları ve korunması gereken davranışlar

Bir sonraki geliştirici aşağıdaki maddeleri geçici implementasyon detayı değil,
bu sohbet boyunca web/PWA için verilmiş ürün kararları olarak görmelidir. Native
iOS uygulamasının bilinçli farklılıkları Bölüm 14'te ayrıca yazılmıştır:

- Uygulama tek kullanıcı içindir.
- Yeni kullanıcı signup kapalı kalmalıdır.
- Anonymous sign-in kapalı kalmalıdır.
- E-posta session'ı uygulama açılışları arasında kalıcı olmalıdır.
- Veri önce local'e yazılmalı; ağ ana UI'yi bloklamamalıdır.
- Supabase sync/backup kopyasıdır; tek veri güvenliği katmanı değildir.
- UI'nin genel görünümü kullanıcı tarafından beğenilmektedir ve korunmalıdır.
- Activity/Budgets header'ı standalone iOS native gölgesinin hemen altında,
  gereksiz büyük boşluk bırakmadan durmalıdır.
- Safari browser görünümü standalone düzeltmelerden etkilenmemelidir.
- Expense Delete tek dokunuşta çalışmalıdır.
- Logout mutlaka onay istemelidir.
- `Sync now` okunabilir olmalıdır.
- Login/sync durumu minimal yeşil/status noktasıyla görünmelidir.
- Upcoming/Not started budget günlük limiti göstermelidir.
- Existing Home Screen PWA deploy'lardan otomatik güncellenebilmelidir.
- Database dolmadan otomatik veri silme yapılmamalıdır.
- Tablolar/RLS yanlışlıkla drop edilmemelidir.
- Cloud hard-delete işlemi yapılırken yerel IndexedDB'nin ayrı kaldığı unutulmamalıdır.
- Uzun yıllar kullanım için en değerli gelecek yatırım bağımsız backup'tır.

## 14. Ayrı native iOS uygulaması — eksiksiz devir

### 14.1 Neden ve nasıl oluşturuldu

Web/PWA geliştirmesi bittikten sonra kullanıcı, ücretli Apple Developer hesabı
olmadan iPhone'da yedi günlük Personal Team provisioning ile deneyebileceği ayrı
bir iOS uygulaması istedi. Bu uygulama “fantezi/deney” amaçlıdır ve production
PWA'nın yerine geçmesi şart değildir.

Kullanıcının açık ürün kararları:

- Proje ve görünen uygulama adı her yerde boşluksuz `ZeroBudget` olmalı.
- Mevcut UI, animasyonlar, budget/expense/category fonksiyonları mümkün olduğunca
  birebir korunmalı.
- Mevcut web/Supabase verisi taşınmamalı veya eşlenmemeli.
- Supabase, login, sync, recovery ve cloud backup bulunmamalı.
- Veri yalnızca uygulamanın kendi local konteynerinde tutulmalı.
- Uygulama silinince verinin silinmesi kabul edildi.
- Settings içindeki Signing/Account, Sync ve Backup alanları kaldırılmalı;
  Categories yönetimi kalmalı.
- Önce simulator build ve görünüm doğrulanmalı, sonra fiziksel telefona yüklenmeli.

Uygulama SwiftUI ile sıfırdan yeniden yazılmadı. Mevcut React/Vite UI ve iş
mantığı kopyalanıp Capacitor 8 native iOS kabuğuna gömüldü. Kullanıcı açısından
Home Screen'den açılan, sandbox'ı ve imzalı `.app` paketi olan gerçek bir iOS
uygulamasıdır; teknik olarak UI bir `WKWebView` içinde çalışır.

Bu yaklaşımın nedeni görünüm ve davranışı minimum riskle birebir korumaktı.
SwiftUI rewrite çok daha uzun sürer, iki implementasyon arasında görsel/işlevsel
sapma riski yaratırdı.

### 14.2 Native repo ve Git durumu

- Repo yolu: `/Users/egowic/Xcode/ZeroBudget`
- Branch: `main`
- Repo web projesinden bağımsız olarak `git init` ile oluşturuldu.
- Web repo geçmişi veya `.git` klasörü kopyalanmadı.
- Herhangi bir GitHub remote oluşturulmadı/push yapılmadı.
- İlk native commit:
  `9119bda Build local-only ZeroBudget iOS app`
- Cihaz imzalama commit'i:
  `94c68e4 Configure Personal Team device signing`
- Build çıktıları `DerivedData/`, `DeviceDerivedData/`, `dist/`, generated native
  public/config dosyaları ve `node_modules/` ignore edilir.

Native uygulama hazırlanırken production web repo üzerinde değişiklik yapılmadığı
ve web repo worktree'sinin temiz kaldığı ayrıca kontrol edildi.

### 14.3 Native teknoloji yığını ve paketler

- React 19
- TypeScript 5.9
- Vite 7
- Tailwind CSS 4
- Dexie 4 + `dexie-react-hooks`
- Capacitor Core/iOS/CLI 8.5.0
- Xcode 27 beta
- Minimum deployment target: iOS 15.0
- Target device family: yalnızca iPhone (`TARGETED_DEVICE_FAMILY = 1`)
- Orientation: yalnızca portrait

`package.json` native script'leri:

```text
npm run dev
npm run typecheck
npm test
npm run build
npm run native:sync
npm run native:open
```

`native:sync`, önce production web bundle'ını üretir, sonra `cap sync ios` ile
`dist` içeriğini Xcode projesine kopyalar. Source değiştirilip yalnız Xcode'da
Run'a basılırsa eski bundle çalışabilir; bu nedenle her web-source değişikliğinden
sonra `npm run native:sync` zorunlu kabul edilmelidir.

### 14.4 Native taraftan çıkarılan web/PWA ve cloud parçaları

Native repo ilk oluşturulurken aşağıdakiler kaldırıldı:

- Supabase client dependency'si ve tüm `src/sync/*` dosyaları
- Login ekranı ve auth gate
- `SyncDot` ve header'lardaki yeşil/cloud durum noktaları
- Account email, Sync now, logout, export/restore ve recovery Settings UI'ları
- Outbox entity/table ve enqueue logic'i
- PWA plugin'i (`vite-plugin-pwa`), manifest/service-worker üretimi
- PWA standalone/iOS beta user-agent/geometri tespiti
- GitHub Pages'e özel absolute base path; native build `base: './'` kullanır
- `robots.txt` ve web deployment'a özel PWA metadata

`SettingsSheet` native uygulamada yalnızca `Spending → Categories` satırını
gösterir.

### 14.5 Native local data modeli

Database adı hâlâ `zero`dur ve Dexie üzerinden WKWebView'in IndexedDB alanında
oluşturulur. Store'lar:

- `budgets`
- `expenses`
- `categories`
- `meta`

Native uygulamada outbox yoktur. Mutation'lar doğrudan local IndexedDB'ye yazar.
Cloud veya network beklenmez.

Web/PWA'dan önemli farklar:

- Native expense delete gerçek local hard delete yapar.
- Native budget delete gerçek local hard delete yapar; date-based expense'ler
  korunur.
- Custom category delete kategoriyi hard delete eder ve o kategoriye bağlı local
  expense'lerin `categoryId` alanını `null` yapar.
- Web/PWA ise cihazlar arası sync resurrection'ını engellemek için tombstone
  kullanmaya devam eder.

İlk simulator açılışında WebKit app container'ı içinde gerçek
`IndexedDB.sqlite3` dosyasının oluştuğu doğrulandı. Object store inspection
sonucunda 9 built-in category ve 1 meta kaydı bulundu; budget ve expense başlangıçta
boştu.

Veri uygulama kapanıp açılınca ve normal update install yapılınca aynı bundle
identifier altında kalır. Kullanıcı uygulamayı iPhone'dan manuel silerse app
container ve tüm native local veri silinir. Native uygulamada bunu kurtaracak
Supabase veya export/restore ekranı yoktur; bu bilinçli karardır.

### 14.6 Korunan UI ve davranışlar

Mevcut PWA'nın aşağıdaki ana davranışları native kopyada korundu:

- Activity timeline
- Budgets listesi ve budget hero
- Expense oluşturma, tarih/note/category seçimi
- Expense detayından category değiştirme ve delete
- Budget oluşturma/düzenleme/silme
- Month/week/custom period
- Repeat ve recurring budget roll
- Upcoming/`Not started` budget için günlük limit
- Custom category oluşturma, emoji/name/color düzenleme ve silme
- Aynı dark tema, kartlar, bottom sheet'ler, tab bar ve custom expense keypad
- Category selection'ın anında selected görünmesini sağlayan optimistik UI fix'i

Expense miktarı girişinde iOS sistem klavyesi beklenmez; tasarım gereği uygulamanın
kendi büyük `Keypad` bileşeni kullanılır. Budget name/amount, note ve category
name/emoji alanları normal iOS klavyesini açar. Fiziksel cihaz testinde bir an
klavyenin açılmadığı sanıldı; telefonun o andaki input/keyboard durumundan
kaynaklandığı anlaşılınca kullanıcı klavyenin çalıştığını doğruladı. Bu konuda
kod değişikliği yapılmadı.

### 14.7 Native görünüm ve iOS kabuğu ayarları

- App display name: `ZeroBudget`
- İlk düşünülen bundle ID: `com.egowic.ZeroBudget`
- Apple bu identifier'ın küresel olarak müsait olmadığını bildirdi.
- Güncel benzersiz bundle ID: `com.egowic.zerobudget.egebilir`
- Bundle ID teknik kimliktir; kullanıcıya görünen uygulama adını değiştirmedi.
- App icon, web/PWA'daki `public/icon-512.png` kaynağından 1024 × 1024 native
  asset olarak üretildi.
- Launch screen herhangi bir default Capacitor görseli göstermeden düz uygulama
  rengi `#09090c` kullanır.
- Native window ve bridge controller background'u da `#09090c`; yükleme sırasında
  beyaz flash oluşmaması hedeflendi.
- `UIUserInterfaceStyle = Dark`
- Status bar light content
- Yalnız portrait orientation
- Standalone PWA için geliştirilen özel 1.75rem/iOS 27 shadow workaround'u native
  repoya taşınmadı. Native uygulama standart `env(safe-area-inset-*)` kuralları
  kullanır ve simulator/fiziksel app kabuğuna göre çalışır.

### 14.8 Geliştirme ortamı

Kurulum sırasında doğrulanan ortam:

- macOS 27 beta
- Xcode: `/Applications/Xcode-beta.app`
- Xcode version/build: 27.0 (`27A5228h`)
- Sistem `xcode-select` yolu Command Line Tools'a işaret ediyordu.

Bu nedenle shell üzerinden Xcode/simctl/devicectl komutlarında şu prefix
kullanıldı:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer
```

Bu prefix olmadan shell yanlış toolchain'i kullanabilir. Xcode GUI içinden build
ederken ayrıca gerekmez.

### 14.9 Simulator doğrulaması

Kullanıcının telefonu iPhone 14 Pro Max olmasına rağmen ilk native doğrulama
iPhone 17 Pro simulator üzerinde yapıldı. App iPhone-only/autolayout/safe-area
tabanlı olduğu için model farkı build'i engellemez; fiziksel 14 Pro Max testi de
sonradan yapıldı.

Kullanılan simulator:

- iPhone 17 Pro
- Simulator runtime: iOS 26.4.1
- Simulator UUID: `44B32DC8-3897-4D0E-B354-B438499AAEAC`

Simulator build komutu:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=44B32DC8-3897-4D0E-B354-B438499AAEAC' \
  -derivedDataPath DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Doğrulanan sonuçlar:

- Typecheck başarılı
- 1 test dosyasında 11/11 test başarılı
- Vite production build başarılı; 55 module transform edildi
- Capacitor sync başarılı
- Xcode simulator build başarılı
- `.app` simulator'a kuruldu ve açıldı
- Koyu launch/status bar, üst safe-area, Activity header, Settings butonu ve
  bottom tab bar görsel olarak doğru konumdaydı
- App terminate edilip yeniden launch edildi; UI tekrar doğru açıldı
- Local IndexedDB dosyası ve seed kayıtları diskte doğrulandı
- `npm audit --omit=dev`: 0 vulnerability
- Tüm dependency audit'inde Capacitor CLI'ın dev-only `xcode → uuid` zincirinden
  3 moderate kayıt görüldü. Runtime/prod dependency riski değildi; kırıcı
  `npm audit fix --force` uygulanmadı.

### 14.10 Fiziksel iPhone 14 Pro Max'e Wi-Fi kurulumu

Fiziksel cihaz:

- Ad: `Ege’s Iphone`
- Model: iPhone 14 Pro Max (`iPhone15,3`)
- iOS: 27.0 beta (`24A5408d`)
- Xcode tarafından `network` interface ile görüldü
- Device Developer Mode kullanıcı tarafından etkinleştirildi
- İlk eşleştirme Finder/Xcode üzerinden yapıldı; son kurulum Wi-Fi ile tamamlandı

Apple hesabı/sertifika:

- Apple Development certificate geçerliydi
- Personal Team ID: `6MQKTG872G`
- Xcode target Debug ve Release config'lerine
  `DEVELOPMENT_TEAM = 6MQKTG872G` kalıcı olarak eklendi
- Signing style automatic

İlk cihaz build'i Development Team seçilmediği için durdu. Team eklendikten
sonra `com.egowic.ZeroBudget` identifier'ı müsait olmadığı için ikinci kez durdu.
Bundle ID `com.egowic.zerobudget.egebilir` yapıldıktan sonra Xcode App ID ve free
provisioning profile'ı otomatik oluşturdu ve signed device build başarılı oldu.

Cihazı her seferinde yeniden keşfetmek için:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcrun devicectl list devices

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcrun xcdevice list --timeout 20
```

Son doğrulanan fiziksel UDID:
`00008120-001905E00C40C01E`

Device build komutu:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'id=00008120-001905E00C40C01E' \
  -derivedDataPath DeviceDerivedData \
  -allowProvisioningUpdates \
  build
```

Üretilen paket:

```text
DeviceDerivedData/Build/Products/Debug-iphoneos/App.app
```

Wi-Fi install/launch örneği:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcrun devicectl device install app \
  --device <devicectl-core-device-identifier> \
  DeviceDerivedData/Build/Products/Debug-iphoneos/App.app

DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
xcrun devicectl device process launch \
  --device <devicectl-core-device-identifier> \
  com.egowic.zerobudget.egebilir
```

`devicectl` core-device identifier ile iPhone UDID aynı değer olmak zorunda
değildir; her kurulum öncesi `devicectl list devices` çıktısından güncel değeri
almak daha güvenlidir.

İlk install başarılı oldu ancak ilk remote launch, developer profile kullanıcı
tarafından henüz explicit trust edilmediği için Security/RequestDenied hatası
verdi. Kullanıcı iPhone'da Settings → General → VPN & Device Management içinden
`Apple Development` profilini trust etti. Sonrasında uygulamayı açıp gerçek cihazda
test etti ve çalıştığını doğruladı.

Ücretsiz Personal Team provisioning yaklaşık yedi gün geçerlidir. Süre dolunca
app açılmayabilir; aynı team ve bundle identifier ile yeniden build/install
edilmelidir. App telefondan silinmeden update install yapılması local verinin
korunması için önemlidir. Ücretli Apple Developer hesabı yoktur; App Store veya
TestFlight deployment yapılmadı.

### 14.11 Native tarafta önemli dosyalar

- `/Users/egowic/Xcode/ZeroBudget/capacitor.config.ts` — app ID/ad/webDir
- `/Users/egowic/Xcode/ZeroBudget/package.json` — web/native scripts ve paketler
- `/Users/egowic/Xcode/ZeroBudget/src/App.tsx` — auth'suz doğrudan app shell
- `/Users/egowic/Xcode/ZeroBudget/src/main.tsx` — seed + recurring roll startup
- `/Users/egowic/Xcode/ZeroBudget/src/index.css` — tema ve standard safe areas
- `/Users/egowic/Xcode/ZeroBudget/src/db/schema.ts` — local-only Dexie schema
- `/Users/egowic/Xcode/ZeroBudget/src/db/mutations.ts` — doğrudan local writes
- `/Users/egowic/Xcode/ZeroBudget/src/screens/SettingsSheet.tsx` — yalnız Categories
- `/Users/egowic/Xcode/ZeroBudget/ios/App/App/Info.plist` — portrait/dark/status bar
- `/Users/egowic/Xcode/ZeroBudget/ios/App/App/SceneDelegate.swift` — native dark window
- `/Users/egowic/Xcode/ZeroBudget/ios/App/App/Base.lproj/LaunchScreen.storyboard`
- `/Users/egowic/Xcode/ZeroBudget/ios/App/App.xcodeproj/project.pbxproj` — target,
  bundle ID, Team ve signing
- `/Users/egowic/Xcode/ZeroBudget/README.md` — kısa native kullanım notları

### 14.12 Native uygulama için güncelleme prosedürü

Bir sonraki geliştirici native uygulamada değişiklik yaparsa önerilen sıra:

```bash
cd /Users/egowic/Xcode/ZeroBudget
npm ci
npm run typecheck
npm test
npm run native:sync
```

Ardından simulator build/test; sonuç temizse physical device build/install.
Fiziksel cihaz aynı Wi-Fi'da, eşleşmiş, açık/erişilebilir ve Developer Mode açık
olmalıdır.

Her native update'te:

1. Source değişikliklerini yap.
2. `npm run native:sync` ile web asset'lerini native projeye yenile.
3. `xcodebuild` veya Xcode Run ile signed device build al.
4. Mevcut app'in üzerine install et; local veri gerekiyorsa app'i silme.
5. Gerçek 14 Pro Max'te input, sheet, safe-area ve local persistence smoke test yap.
6. Native repo içinde ayrı commit oluştur.

PWA'nın service-worker gibi otomatik uzaktan update mekanizması native app'te
yoktur. Native source/bundle değişiklikleri iPhone'a ancak yeni signed build
kurulunca ulaşır.

### 14.13 Native ürün kararları ve dokunulmaması gereken sınırlar

- Native uygulamaya kullanıcı istemeden Supabase veya login geri eklenmemeli.
- Native ve PWA verilerinin bağımsız kalması bilinçli karardır.
- Native Settings yalnız Categories içermelidir.
- UI genel olarak redesign edilmemeli; kullanıcı mevcut görünümü birebir istedi.
- Bundle ID değiştirilmemeli; aksi halde iOS bunu ayrı app sayar ve eski local
  app container'ına erişim kaybolur.
- Personal Team/Developer Mode gereksinimi App Store deployment değildir.
- App silinirse verinin silinmesi kabul edilmiştir; şu an native backup yoktur.
- PWA tombstone/sync mantığı native local mutation'lara yanlışlıkla taşınmamalı.
- Native app'te expense custom keypad ile girilir; bunun sistem klavyesi açmaması
  bug değildir.
- Web/PWA'ya yapılan yeni bir fix native'e otomatik geçmez; iki repo açıkça
  karşılaştırılmalıdır.

## 15. Claude Code için başlangıç kontrol listesi

1. Kullanıcının isteğinin web/PWA'yı mı yoksa native iOS uygulamasını mı hedeflediğini
   ilk olarak belirle.
2. Web/PWA için `/Users/egowic/Repos/Project Zero` içinde çalış.
3. Native için `/Users/egowic/Xcode/ZeroBudget` içinde çalış.
4. İki repo arasında dosya kopyalamadan önce cloud/auth/outbox farklarını incele;
   komple dosya overwrite etme.
5. Web/PWA değişikliğinde typecheck + 11 test + Pages production build/deploy'i
   doğrula.
6. Native değişikliğinde typecheck + 11 test + `native:sync` + simulator build,
   sonra gerekirse Wi-Fi physical install yap.
7. Supabase destructive işleminden önce açık kullanıcı onayı al ve exact rows'u
   read-only query ile belirle.
8. Native app'i fiziksel cihazdan silme; local-only veri kurtarılamaz.
9. Gizli Supabase değerlerini, database parolasını veya Apple private key'i
   handover/commit içine yazma.
10. Bu dosya ile güncel `main` kodu çelişirse çalışan kodu incele; eski kronolojik
    bölümlerin ara iterasyonları nihai mimari sanılmamalıdır.
