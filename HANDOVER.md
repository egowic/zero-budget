# Zero Budget — Proje Handover

Son güncelleme: 14 Ağustos 2026

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
bu sohbet boyunca verilmiş ürün kararları olarak görmelidir:

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
