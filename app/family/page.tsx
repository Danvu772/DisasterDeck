import { FamilyCall } from "@/components/voice/FamilyCall";

export default function FamilyPage() {
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <header><p className="text-sm font-bold text-primary">Disaster Desk · Family information</p>
      <h1 className="mt-2 text-3xl font-bold">Bir yakınınız hakkında bilgi alın</h1>
      <p className="mt-3 text-muted">İsimle arayın, yayımlanmış bilgiyi okuyun veya sesli olarak sorun. Giriş yapmanız ya da kod girmeniz gerekmez. Bilgi bulunmaması, kişinin durumu hakkında bir sonuç ifade etmez.</p></header>
    <FamilyCall />
    <aside className="rounded-card border border-line bg-card p-4 text-sm text-muted">
      Bu hizmet bir yapay zekâ asistanıdır; acil yardım veya canlı görevli hattı değildir. Görüşme tarayıcı mikrofonuyla yapılır, telefon numarası aranmaz.
      Sesiniz ElevenLabs tarafından işlenir; sorunuz ve onaylı güncelleme yanıt için Claude’a gönderilir. Uygulama ses kaydı veya konuşma geçmişi saklamaz.
      ElevenLabs tarafında ses kaydı kapalı, konuşma metni saklama süresi 1 gün olarak yapılandırılır. Özel belge veya kimlik bilgisi paylaşmayın.
    </aside>
  </main>;
}
