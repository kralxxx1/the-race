-- Customers: personalities, names and everything they say.
-- Each archetype tunes money (budget), patience, haggling, tips and how harshly it rates you,
-- which devices it brings, how it looks, and its own lines. Generic lines fill the gaps.
--
--   budget    multiplier on the fair price the customer is willing to pay
--   patience  multiplier on Config.CustomerPatienceMinutes
--   haggle    0..1 chance to counter-offer instead of accepting
--   tip       chance to tip on a good job
--   harsh     0..1, how much small flaws cost you in the rating
--   nag       seconds between "is it done yet?" bubbles while waiting (nil = never)

local Customers = {}

local function L(tr: { string }, en: { string })
	return { tr = tr, en = en }
end

Customers.archetypes = {
	{
		id = "student", weight = 12, level = 1, name = { tr = "Öğrenci", en = "Student" },
		device = { laptopChance = 0.75, tiers = { "budget", "office" }, classes = { "budget15", "ultra14" } },
		budget = 0.75, patience = 1.2, haggle = 0.6, tip = 0.1, harsh = 0.35, look = "student",
		lines = {
			greet = L({ "Selam abi, ödev teslimim yarın, yardım eder misin?", "Merhaba, bursum yattı ama çok param yok, uygun olur mu?", "Hocam kurtar beni, tezim bu bilgisayarda!" }, { "Hi, my assignment is due tomorrow, can you help?", "Hello, I'm on a student budget, can we keep it cheap?", "Save me, my thesis is on this laptop!" }),
			haggle = L({ "Öğrenciyim abi, {price} olsa?", "Bursum ancak {price} yetiyor..." }, { "I'm a student, could it be {price}?", "My grant only stretches to {price}..." }),
			reject = L({ "Bu fiyata yemek yemem bir ay...", "Kusura bakma, çok pahalı." }, { "That's a month of my food money...", "Sorry, that's too expensive." }),
			nag = L({ "Abi ders başlıyor, az kaldı mı?", "Notlarım duruyor değil mi?" }, { "Class starts soon, almost done?", "My notes are still there, right?" }),
			happy = L({ "Hayat kurtardın abi! Herkese söyleyeceğim.", "Süpersin, tezim kurtuldu!" }, { "You saved my life! I'll tell everyone.", "You're awesome, my thesis is saved!" }),
			angry = L({ "Bekleyemem, sınava geç kalacağım!", "Başka yere gidiyorum." }, { "I can't wait, I'll be late for my exam!", "I'm going elsewhere." }),
		},
	},
	{
		id = "gamer_teen", weight = 11, level = 1, name = { tr = "Oyuncu Genç", en = "Teen Gamer" },
		device = { laptopChance = 0.25, tiers = { "budget", "mid", "high" }, classes = { "gaming15" } },
		budget = 1.0, patience = 0.7, haggle = 0.35, tip = 0.25, harsh = 0.55, look = "gamer",
		lines = {
			greet = L({ "Kanka acil! Turnuva akşam!", "Abi FPS 20'ye düştü, Valorant oynayamıyorum!", "Merhaba, babam 'bozarsan kendin yaptır' dedi..." }, { "Bro, urgent! Tournament tonight!", "My FPS dropped to 20, I can't play Valorant!", "Hi, my dad said 'you broke it, you fix it'..." }),
			haggle = L({ "Kanka harçlığım {price}, olur mu?", "{price} yapsan GG derim." }, { "My allowance is {price}, deal?", "Make it {price} and I'll say GG." }),
			reject = L({ "Bu fiyata yeni kasa toplarım kanka.", "Annem öldürür beni." }, { "For that I'd build a new rig, bro.", "My mom would kill me." }),
			nag = L({ "Kanka bitti mi? Rank düşecek!", "Abi RGB'ler yanıyor mu bari?", "Arkadaşlar lobide bekliyor!" }, { "Done yet? I'm losing rank!", "Are the RGBs at least working?", "My friends are waiting in the lobby!" }),
			happy = L({ "EFSANE! 240 FPS geldi!", "Kanka helal olsun, abone oldum!" }, { "LEGENDARY! 240 FPS!", "Respect, bro, subscribed!" }),
			angry = L({ "Ragequit atıyorum, bekleyemem!", "Lag gibisin abi, gidiyorum." }, { "Ragequit, I'm out!", "You're lagging, I'm leaving." }),
		},
	},
	{
		id = "streamer", big = true, weight = 4, level = 4, name = { tr = "Yayıncı", en = "Streamer" },
		device = { laptopChance = 0.1, tiers = { "high", "enthusiast" }, classes = { "gaming17" } },
		budget = 1.6, patience = 0.6, haggle = 0.1, tip = 0.55, harsh = 0.6, look = "streamer", extraFaultChance = 0.25,
		lines = {
			greet = L({ "Selam! Yayındayım şu an, chat de seni izliyor!", "Akşam 8'de 10 bin kişilik yayınım var, PC lazım!", "Sponsorum sizi önerdi, umarım hızlısınızdır." }, { "Hi! I'm live right now, chat is watching you!", "I've got a 10k-viewer stream at 8, I need my PC!", "My sponsor recommended you, hope you're fast." }),
			haggle = L({ "{price} olursa yayında reklamını yaparım.", "{price} ve bir shoutout?" }, { "Make it {price} and I'll shout you out on stream.", "{price} plus a shoutout?" }),
			reject = L({ "Chat 'scam' yazıyor, pas geçiyorum.", "Bu fiyat bize uymaz." }, { "Chat says 'scam', I'll pass.", "That price doesn't work for us." }),
			nag = L({ "Chat soruyor: bitti mi?", "Yayın başlamak üzere!", "Moderatörler panik yapıyor!" }, { "Chat is asking: is it done?", "The stream's about to start!", "My mods are panicking!" }),
			happy = L({ "Chat: 'efsane tamirci' yazıyor! Teşekkürler!", "Bunu klip yapacağım, harikasın!" }, { "Chat says 'legendary tech'! Thanks!", "I'm clipping this, you're great!" }),
			angry = L({ "Yayını iptal ettim, kötü yorum geliyor.", "Chat sizi eleştirecek, haberiniz olsun." }, { "Stream cancelled, bad review incoming.", "Chat is going to roast you." }),
		},
	},
	{
		id = "aunt", weight = 10, level = 1, name = { tr = "Teyze", en = "Auntie" }, gender = "f",
		device = { laptopChance = 0.55, tiers = { "office", "retro" }, classes = { "budget15" } },
		budget = 0.95, patience = 1.6, haggle = 0.3, tip = 0.4, harsh = 0.2, look = "aunt",
		lines = {
			greet = L({ "Evladım hoş geldin, bu bilgisayar küsmüş bana.", "Torunum bir şey yükledi, o günden beri böyle oğlum.", "Facebook açılmıyor yavrum, bir bakar mısın?" }, { "Hello dear, this computer is sulking at me.", "My grandson installed something and now look.", "Facebook won't open, dear, could you look?" }),
			haggle = L({ "Oğlum biraz yardımcı ol, {price} olsun.", "Emekli maaşı yavrum, {price} versem?" }, { "Help me out a little, make it {price}.", "It's a pension, dear, could I pay {price}?" }),
			reject = L({ "Vay vay vay, o kadar etmez yavrum.", "Oğlum bir sorayım, sonra gelirim." }, { "Oh my, it's not worth that, dear.", "Let me ask my son, I'll be back." }),
			nag = L({ "Sana çay getireyim mi evladım?", "Acele etme yavrum, ben otururum.", "Hiç acıktın mı? Börek yaptım." }, { "Shall I bring you some tea, dear?", "No rush, dear, I'll sit.", "Are you hungry? I made pastry." }),
			happy = L({ "Allah razı olsun evladım, eline sağlık!", "Maşallah, ne becerikli çocuk!" }, { "Bless you, dear, well done!", "What a talented young one!" }),
			angry = L({ "Akşam yemeği yanacak, gideyim artık.", "Çok bekledim yavrum, kusura bakma." }, { "Dinner will burn, I must go.", "I've waited too long, sorry dear." }),
		},
	},
	{
		id = "uncle", weight = 10, level = 1, name = { tr = "Pazarlıkçı Amca", en = "Haggling Uncle" }, gender = "m",
		device = { laptopChance = 0.25, tiers = { "retro", "office", "budget" }, classes = { "budget15", "business14" } },
		budget = 0.8, patience = 1.1, haggle = 0.9, tip = 0.1, harsh = 0.45, look = "uncle",
		lines = {
			greet = L({ "Usta bak, 2008'den beri bu kasayı kullanıyorum, bir şey olmaz ona.", "Hayırlı işler. Ucuzundan bir bakıver.", "Kardeşim bunu yapan olmadı, sen yaparsın dediler." }, { "Look, I've used this case since 2008, nothing breaks it.", "Good day. Have a look, the cheap way.", "Nobody could fix this, they said you would." }),
			haggle = L({ "Usta ne diyorsun, {price} ver elini!", "Hadi {price}, kahvesi benden.", "Bak nakit veriyorum, {price} olsun." }, { "Come on, {price}, shake on it!", "Let's say {price}, coffee's on me.", "Cash in hand, make it {price}." }),
			reject = L({ "Haydi oradan! Karşı dükkan yarısına yapıyor.", "Bu ne pahalılık, devir kötü." }, { "Get out! The shop across does it for half.", "What prices, these times are bad." }),
			nag = L({ "Hadi usta, iki çay içimlik iş bu.", "Biz zamanında kendimiz yapardık bunları." }, { "Come on, it's a two-tea job.", "In my day we fixed these ourselves." }),
			happy = L({ "Eyvallah usta, eline sağlık. Komşulara da söylerim.", "Helal olsun, işini biliyorsun." }, { "Thanks, master, I'll tell the neighbours.", "Respect, you know your trade." }),
			angry = L({ "Ben bunu 10 dakikada yapardım! Gidiyorum.", "Bu ne yavaşlık yahu!" }, { "I'd have done this in 10 minutes! I'm off.", "What slowness!" }),
		},
	},
	{
		id = "grandpa", weight = 7, level = 1, name = { tr = "Dede", en = "Grandpa" }, gender = "m",
		device = { laptopChance = 0.2, tiers = { "retro", "office" }, classes = { "budget15" } },
		budget = 1.0, patience = 2.0, haggle = 0.15, tip = 0.5, harsh = 0.15, look = "grandpa",
		lines = {
			greet = L({ "Merhaba evlat. Gazetemi bu bilgisayardan okuyordum, şimdi açılmıyor.", "Torunlarla görüntülü konuşuyordum, bozuldu.", "Bu alet beni sevmiyor galiba evlat." }, { "Hello, young one. I read my paper on this, now it won't start.", "I video-called my grandkids on it, now it's broken.", "I think this machine doesn't like me." }),
			haggle = L({ "Evlat, {price} versem kırılmazsın değil mi?" }, { "Would {price} offend you, young one?" }),
			reject = L({ "Bizim zamanımızda bu paraya ev alınırdı.", "Biraz düşüneyim evlat." }, { "In my day you'd buy a house for that.", "Let me think it over." }),
			nag = L({ "Acele yok evlat, ben gazetemi okurum.", "Senin yaşındayken radyo tamir ederdim." }, { "No rush, I'll read my paper.", "At your age I repaired radios." }),
			happy = L({ "Aferin evlat, al bu da harçlığın.", "Ellerine sağlık, maşallah." }, { "Well done, here's a little extra.", "Bless your hands." }),
			angry = L({ "Namaz vakti geldi evlat, ben gideyim.", "Yoruldum evlat, sonra gelirim." }, { "It's getting late, I'd better go.", "I'm tired, I'll come back later." }),
		},
	},
	{
		id = "business", big = true, weight = 7, level = 2, name = { tr = "İş İnsanı", en = "Businessperson" },
		device = { laptopChance = 0.8, tiers = { "mid", "high", "office" }, classes = { "business14", "ultra14" } },
		budget = 1.45, patience = 0.6, haggle = 0.1, tip = 0.35, harsh = 0.6, look = "business",
		lines = {
			greet = L({ "Saat üçte toplantım var, ekstra öderim yeter ki yetişsin.", "Asistanım buraya yönlendirdi. Vaktim kısıtlı.", "Sunumum bu bilgisayarda, kaybedersem şirket batar." }, { "I have a meeting at three, I'll pay extra if it's ready.", "My assistant sent me here. My time is limited.", "My presentation is on this; lose it and the company's done." }),
			haggle = L({ "Fatura keserseniz {price} uygundur." }, { "If you invoice it, {price} works." }),
			reject = L({ "Bu fiyatı muhasebeme açıklayamam.", "Kurumsal servis daha ucuz." }, { "I can't justify that to accounting.", "Corporate service is cheaper." }),
			nag = L({ "Toplantıya 20 dakika var.", "Durum nedir? Mail atmam lazım.", "Bekleme odanızda Wi-Fi yok mu?" }, { "Twenty minutes to my meeting.", "Status? I need to send emails.", "No Wi-Fi in your waiting room?" }),
			happy = L({ "Mükemmel, şirketimizin tüm bilgisayarlarını size getireceğim.", "Profesyonel iş, teşekkürler." }, { "Excellent, I'll bring all our company PCs to you.", "Professional work, thank you." }),
			angry = L({ "Toplantıyı kaçırdım. Bunun hesabını soracağım!", "Zamanım paradan değerli. Hoşça kalın." }, { "I missed the meeting. You'll hear about this!", "My time is worth more than money. Goodbye." }),
		},
	},
	{
		id = "office_manager", weight = 5, level = 3, name = { tr = "Ofis Müdürü", en = "Office Manager" },
		device = { laptopChance = 0.4, tiers = { "office", "budget" }, classes = { "business14", "budget15" } },
		budget = 1.2, patience = 1.0, haggle = 0.4, tip = 0.2, harsh = 0.4, look = "business",
		lines = {
			greet = L({ "Muhasebedeki bilgisayar yine çöktü, Excel'ler içinde!", "Şirketin bilgisayarı, fatura lazım olacak.", "Stajyer kahve döktü, ne olur kurtarın." }, { "The accounting PC crashed again, spreadsheets inside!", "Company machine, I'll need an invoice.", "The intern spilled coffee, please save it." }),
			haggle = L({ "Bütçemiz {price}, üst onay almadan çıkamam." }, { "Our budget is {price}, I can't go over without approval." }),
			reject = L({ "Patrona soracağım, şimdilik bu fiyat olmaz." }, { "I'll ask the boss, not at this price for now." }),
			nag = L({ "Patron üç kere aradı bile.", "Maaşlar bu bilgisayardan yatacak!" }, { "The boss called three times already.", "Payroll runs on this machine!" }),
			happy = L({ "Harika, sözleşmeli servisimiz olur musunuz?", "Patron çok memnun kalacak." }, { "Great, would you be our contracted service?", "The boss will be very pleased." }),
			angry = L({ "Bu kadar beklemeye bütçemiz yok.", "Kurumsal servise gidiyoruz." }, { "We can't afford to wait this long.", "We're going to corporate service." }),
		},
	},
	{
		id = "designer", weight = 5, level = 3, name = { tr = "Mimar / Tasarımcı", en = "Architect / Designer" },
		device = { laptopChance = 0.35, tiers = { "high", "workstation", "mid" }, classes = { "ultra14", "gaming15" } },
		budget = 1.3, patience = 0.9, haggle = 0.2, tip = 0.3, harsh = 0.55, look = "designer",
		lines = {
			greet = L({ "Render'ım yarıda kaldı, teslim tarihi yarın sabah.", "Projelerim bu makinede, lütfen dikkatli olun.", "Photoshop açılırken mavi ekran veriyor." }, { "My render stopped halfway, deadline is tomorrow morning.", "My projects are on this machine, please be careful.", "Photoshop blue-screens on launch." }),
			haggle = L({ "{price} ile anlaşabilir miyiz?" }, { "Can we agree on {price}?" }),
			reject = L({ "Bu fiyat projenin kârını yer." }, { "That eats the whole project's profit." }),
			nag = L({ "Müşterim aradı, render nerede diye.", "Dosyalarım yerinde değil mi?" }, { "My client called asking for the render.", "My files are safe, right?" }),
			happy = L({ "Render süresi yarıya indi, harikasınız!", "Detaylara özen gösteriyorsunuz, sevdim." }, { "Render time halved, you're great!", "You care about details, I like that." }),
			angry = L({ "Teslimi kaçıracağım, başka yere gidiyorum." }, { "I'll miss my deadline, I'm going elsewhere." }),
		},
	},
	{
		id = "developer", weight = 5, level = 2, name = { tr = "Yazılımcı", en = "Developer" },
		device = { laptopChance = 0.6, tiers = { "mid", "high" }, classes = { "business14", "ultra14", "gaming15" } },
		budget = 1.15, patience = 0.9, haggle = 0.3, tip = 0.2, harsh = 0.75, look = "developer",
		lines = {
			greet = L({ "Loglara baktım, bence RAM ama emin değilim.", "Derleme yaparken kapanıyor, termal olabilir.", "Docker açınca kilitleniyor, bir bakar mısın?" }, { "I checked the logs, I think it's RAM but I'm not sure.", "It shuts down while compiling, maybe thermals.", "It locks up when I start Docker, can you look?" }),
			haggle = L({ "Parça fiyatlarını biliyorum, {price} adil olur." }, { "I know part prices, {price} is fair." }),
			reject = L({ "Parça+işçilik bu kadar tutmaz, hesapladım." }, { "Parts plus labour don't add up to that, I checked." }),
			nag = L({ "Commit'lerim bekliyor...", "Production patladı, acele!" }, { "My commits are waiting...", "Production is down, hurry!" }),
			happy = L({ "Temiz iş. Kablo yönetimine bayıldım.", "Root cause'u bulmuşsun, saygılar." }, { "Clean work. Love the cable management.", "You found the root cause, respect." }),
			angry = L({ "Timeout. Başka yere gidiyorum.", "Bu iş async değil sanırım, bekleyemem." }, { "Timeout. Going elsewhere.", "Guess this isn't async, I can't wait." }),
		},
	},
	{
		id = "annoying", difficult = true, weight = 9, level = 1, name = { tr = "Gıcık Müşteri", en = "Annoying Customer" },
		device = { laptopChance = 0.45, tiers = { "budget", "mid", "office" }, classes = { "budget15", "gaming15" } },
		budget = 0.85, patience = 0.55, haggle = 0.85, tip = 0.02, harsh = 0.9, look = "annoying", nag = 14, extraFaultChance = 0.2,
		lines = {
			greet = L({ "Bu bilgisayar dün çalışıyordu, siz bozdunuz herhalde!", "Hızlı ol, ayrıca indirim de istiyorum.", "Geçen sefer buradan çıkınca bozuldu, ona göre!", "Ben müşteriyim, haklıyım, baştan söyleyeyim." }, { "This worked yesterday, you probably broke it!", "Be quick, and I want a discount too.", "Last time it broke right after leaving here!", "The customer is always right, just so you know." }),
			haggle = L({ "{price}! Daha fazla vermem!", "Komşu dükkan {price}'a yapıyormuş.", "{price} ver, yoksa yorumlara yazarım." }, { "{price}! Not a penny more!", "The shop next door does it for {price}.", "{price}, or I'm writing a review." }),
			reject = L({ "Soygun bu! Herkese söyleyeceğim!", "Bu ne fiyat? Tüketici hakem heyetine gideceğim!" }, { "This is robbery! I'll tell everyone!", "What price is this? I'm reporting you!" }),
			nag = L({ "Daha bitmedi mi?!", "Ben bunu 5 dakikada yaparım ya.", "Çay da mı yok burada?", "Müdürünüzle görüşmek istiyorum!", "Neden bu kadar yavaşsınız?", "Saatlerdir bekliyorum! (2 dakika oldu)" }, { "Not done YET?!", "I could do this in 5 minutes.", "No tea here either?", "I want to speak to your manager!", "Why are you so slow?", "I've been waiting for hours! (it's been 2 minutes)" }),
			happy = L({ "Hmm... fena değil. Ama yine de pahalı.", "Bu sefer düzgün çalışsa iyi olur." }, { "Hmm... not bad. Still expensive though.", "It had better work properly this time." }),
			angry = L({ "Bir yıldız bile fazla size!", "Hepinizi şikâyet edeceğim!" }, { "Even one star is too many!", "I'm reporting all of you!" }),
		},
	},
	{
		id = "knowitall", difficult = true, weight = 7, level = 1, name = { tr = "Ukala Bilgiç", en = "Know-it-all" },
		device = { laptopChance = 0.35, tiers = { "mid", "budget", "high" }, classes = { "gaming15", "budget15" } },
		budget = 0.95, patience = 0.85, haggle = 0.5, tip = 0.1, harsh = 0.7, look = "knowitall", nag = 22,
		lines = {
			greet = L({ "YouTube'da izledim, kesin anakart. Ama sen yine de bak.", "Ben bilgisayar mühendisiyim aslında, sadece vaktim yok.", "BIOS'u ben güncelledim, bir şey olmaz demişlerdi." }, { "I watched a YouTube video, it's definitely the motherboard. Look anyway.", "I'm basically a computer engineer, just busy.", "I updated the BIOS myself, they said nothing would happen." }),
			haggle = L({ "Bu iş {price}'lık iş, biliyorum." }, { "This is a {price} job, I know." }),
			reject = L({ "O fiyata ben kendim yaparım, YouTube var." }, { "For that I'll do it myself, YouTube exists." }),
			nag = L({ "Termal macunu X şeklinde sür bu arada.", "Önce CMOS'u sıfırladın mı?", "Kabloları ters takmayın!" }, { "Apply the paste in an X, by the way.", "Did you reset the CMOS first?", "Don't plug the cables in backwards!" }),
			happy = L({ "Tabii, ben söyledim diye buldun.", "Fena değil, benim kadar olmasa da." }, { "Of course, you found it because I told you.", "Not bad, not as good as me though." }),
			angry = L({ "Ben kendim yaparım, gerek yok!" }, { "I'll do it myself, never mind!" }),
		},
	},
	{
		id = "hurry", weight = 6, level = 2, name = { tr = "Aceleci", en = "In a Hurry" },
		device = { laptopChance = 0.6, tiers = { "budget", "mid" }, classes = { "ultra14", "business14", "budget15" } },
		budget = 1.25, patience = 0.45, haggle = 0.05, tip = 0.4, harsh = 0.5, look = "hurry", nag = 18,
		lines = {
			greet = L({ "Çok acil! Uçağım iki saat sonra!", "Hızlı yaparsan ekstra veririm, söz!", "Park yerinde arabam dörtlü yakıyor, çabuk!" }, { "Super urgent! My flight is in two hours!", "Do it fast and I'll pay extra, promise!", "My car's double-parked, quick!" }),
			haggle = L({ "Fiyat önemli değil, yeter ki hızlı olsun." }, { "Price doesn't matter, just be fast." }),
			reject = L({ "Bu kadar sürecekse olmaz, kaçtım!" }, { "If it takes that long, no, I'm off!" }),
			nag = L({ "Hadi hadi hadi!", "Kaç dakika kaldı?", "Uçak kalkıyor!" }, { "Come on, come on!", "How many minutes left?", "The plane is leaving!" }),
			happy = L({ "Roket gibisin! Al bu da bahşişin!", "Yetiştim, teşekkürler!" }, { "You're a rocket! Here's a tip!", "Made it, thanks!" }),
			angry = L({ "Uçağı kaçırdım! Hepsi sizin yüzünüzden!" }, { "I missed my flight! It's all your fault!" }),
		},
	},
	{
		id = "indecisive", weight = 5, level = 2, name = { tr = "Kararsız", en = "Indecisive" },
		device = { laptopChance = 0.5, tiers = { "budget", "mid" }, classes = { "budget15", "gaming15" } },
		budget = 1.0, patience = 1.2, haggle = 0.45, tip = 0.15, harsh = 0.4, look = "casual", requestChance = 0.45,
		lines = {
			greet = L({ "Şey... tamir mi etsem yenisini mi alsam bilemedim.", "Aslında bir sorun yok gibi ama... var galiba?", "Eşim yaptır dedi, ben emin değilim." }, { "Um... repair it or buy new, I can't decide.", "There's no problem really... or maybe there is?", "My partner said get it fixed, I'm not sure." }),
			haggle = L({ "{price} olsa... yoksa olmasın mı... {price} diyelim." }, { "{price} maybe... or not... let's say {price}." }),
			reject = L({ "Bir düşüneyim, belki yarın gelirim. Belki de gelmem." }, { "Let me think, maybe tomorrow. Maybe not." }),
			nag = L({ "Acaba SSD de mi taksak?", "Yok vazgeçtim... yok devam edin.", "Rengi değişse mi kasanın?" }, { "Should we add an SSD too?", "No, never mind... no, carry on.", "Should the case be another colour?" }),
			happy = L({ "Galiba memnun kaldım... evet, memnunum!" }, { "I think I'm happy... yes, I'm happy!" }),
			angry = L({ "Karar veremedim, sonra gelirim." }, { "I couldn't decide, I'll come back." }),
		},
	},
	{
		id = "cheapskate", difficult = true, weight = 7, level = 1, name = { tr = "Cimri", en = "Cheapskate" },
		device = { laptopChance = 0.4, tiers = { "retro", "office", "budget" }, classes = { "budget15" } },
		budget = 0.6, patience = 1.1, haggle = 0.95, tip = 0, harsh = 0.5, look = "cheap", acceptsUsed = true,
		lines = {
			greet = L({ "En ucuzundan olsun, ikinci el parça olur.", "Para yok kardeşim, ama bilgisayar lazım.", "Bedava bakıyor musunuz?" }, { "Cheapest possible, used parts are fine.", "No money, but I need the computer.", "Do you check it for free?" }),
			haggle = L({ "{price}. Son sözüm.", "{price} olsun, taksit yaparsın." }, { "{price}. Final offer.", "{price}, in instalments." }),
			reject = L({ "O paraya bir ay idare ederim!", "Kalsın, eskisi gibi kullanırım." }, { "I'd live a month on that!", "Forget it, I'll use it as it is." }),
			nag = L({ "Elektriğini benim faturamdan mı yakıyorsun?", "Ekstra ücret yok değil mi?" }, { "Is that on my electricity bill?", "No extra charges, right?" }),
			happy = L({ "Ucuza geldi, iyi oldu." }, { "That was cheap, good." }),
			angry = L({ "Paramı başka yerde harcarım." }, { "I'll spend my money elsewhere." }),
		},
	},
	{
		id = "rich", big = true, weight = 6, level = 3, name = { tr = "Zengin", en = "Wealthy" },
		device = { laptopChance = 0.4, tiers = { "enthusiast", "high" }, classes = { "gaming17", "ultra14" } },
		budget = 2.2, patience = 0.8, haggle = 0, tip = 0.7, harsh = 0.45, look = "rich", builds = true, requestChance = 0.35,
		lines = {
			greet = L({ "Şoförüm bekliyor. En iyisini yapın, fiyat önemli değil.", "Yatta internet yoktu, sonra bu oldu.", "Bunun en pahalı parçalarını takın, oğlum oynayacak." }, { "My driver is waiting. Do the best, price doesn't matter.", "There was no internet on the yacht, then this happened.", "Put the most expensive parts in it, it's for my son." }),
			haggle = L({ "Pazarlık mı? Ben pazarlık yapmam." }, { "Haggle? I don't haggle." }),
			reject = L({ "Bu kadar ucuz mu? Kaliteli değildir.", "Ciddi bir yer sanmıştım." }, { "That cheap? Can't be quality.", "I thought this was a serious place." }),
			nag = L({ "Şoförüm saatine bakıyor.", "Kahveniz espresso mu?" }, { "My driver is checking his watch.", "Is your coffee espresso?" }),
			happy = L({ "Mükemmel. Üstü kalsın.", "Size bir yat partisi daveti borçluyum." }, { "Perfect. Keep the change.", "I owe you a yacht party invite." }),
			angry = L({ "Vaktim çok değerli. Elveda." }, { "My time is precious. Farewell." }),
		},
	},
	{
		id = "influencer", big = true, weight = 3, level = 4, name = { tr = "Fenomen", en = "Influencer" },
		device = { laptopChance = 0.6, tiers = { "high", "mid" }, classes = { "ultra14", "gaming15" } },
		budget = 1.3, patience = 0.75, haggle = 0.2, tip = 0.35, harsh = 0.65, look = "influencer", viral = true,
		lines = {
			greet = L({ "Merhaba takipçilerim! Şu an PC tamircisindeyim!", "Bunu hikâyeme atacağım, güzel tamir edin!", "500 bin takipçim var, iyi iş = reklam." }, { "Hi followers! I'm at the PC repair shop right now!", "I'm posting this to my story, make it pretty!", "I have 500k followers, good work = free ads." }),
			haggle = L({ "Story atarsam {price} olur mu?" }, { "If I post a story, is {price} OK?" }),
			reject = L({ "Bu fiyat takipçilerime yakışmaz." }, { "That price doesn't suit my followers." }),
			nag = L({ "Bekleme odası daha estetik olabilirdi.", "Ring light'ınız var mı?" }, { "Your waiting room could be more aesthetic.", "Do you have a ring light?" }),
			happy = L({ "Herkese sizi önereceğim! #tamirci", "Tavsiye listeme girdiniz!" }, { "I'll recommend you to everyone! #techhero", "You're on my recommendations list!" }),
			angry = L({ "Bunu da paylaşacağım ama kötü anlamda." }, { "I'll post this too, but not nicely." }),
		},
	},
	{
		id = "miner", weight = 3, level = 5, name = { tr = "Kripto Madenci", en = "Crypto Miner" },
		device = { laptopChance = 0, tiers = { "mid", "high" } },
		budget = 1.2, patience = 0.8, haggle = 0.6, tip = 0.2, harsh = 0.5, look = "miner",
		lines = {
			greet = L({ "Rig'im ısınıyor, her dakika para kaybediyorum!", "Ekran kartları 7/24 çalışıyor, bir bakım şart.", "Coin düştü, kart da düştü galiba." }, { "My rig is overheating, I lose money every minute!", "The GPUs run 24/7, they need a service.", "The coin crashed, and I think the card did too." }),
			haggle = L({ "{price} — USDT ile ödeyebilirim." }, { "{price} — I can pay in USDT." }),
			reject = L({ "Bu fiyata 3 günlük madencilik eder." }, { "That's three days of mining." }),
			nag = L({ "Hash rate düşüyor...", "Elektrik zamlanmadan bitirelim." }, { "My hash rate is dropping...", "Let's finish before the power price rises." }),
			happy = L({ "Hash rate fırladı, to the moon!" }, { "Hash rate's up, to the moon!" }),
			angry = L({ "Zaman para demek, ben çıkıyorum." }, { "Time is money, I'm out." }),
		},
	},
	{
		id = "neighbor", weight = 6, level = 1, name = { tr = "Esnaf Komşu", en = "Neighbouring Shopkeeper" },
		device = { laptopChance = 0.3, tiers = { "office", "budget" }, classes = { "budget15" } },
		budget = 0.9, patience = 1.3, haggle = 0.5, tip = 0.3, harsh = 0.25, look = "shopkeeper",
		lines = {
			greet = L({ "Selamünaleyküm komşu! Kasanın bilgisayarı yine sustu.", "Komşu bir el atıver, dükkan boş kaldı.", "Yazar kasa programı açılmıyor komşu." }, { "Hello neighbour! The till PC went quiet again.", "Give me a hand, neighbour, I left my shop empty.", "The register software won't start, neighbour." }),
			haggle = L({ "Komşuyuz, {price} yaparsın artık.", "Ben de sana simit getiririm, {price} olsun." }, { "We're neighbours, {price}, come on.", "I'll bring you bagels, make it {price}." }),
			reject = L({ "Komşuya bu fiyat olur mu ya!" }, { "Is that a price for a neighbour?" }),
			nag = L({ "Dükkanı oğlana bıraktım, korkuyorum.", "Çaylar benden komşu!" }, { "I left my son minding the shop, I'm nervous.", "Tea's on me, neighbour!" }),
			happy = L({ "Sağ ol komşu, akşam dönerde ben ısmarlıyorum!", "Bereketli olsun dükkanın." }, { "Thanks, neighbour, dinner's on me!", "May your shop prosper." }),
			angry = L({ "Dükkan boş kaldı, gitmem lazım komşu." }, { "My shop's unattended, I have to go." }),
		},
	},
	{
		id = "tourist", weight = 4, level = 2, name = { tr = "Turist", en = "Tourist" },
		device = { laptopChance = 0.9, tiers = { "mid" }, classes = { "ultra14", "business14" } },
		budget = 1.5, patience = 0.9, haggle = 0.25, tip = 0.5, harsh = 0.35, look = "tourist", foreign = true,
		lines = {
			greet = L({ "Merhaba! Laptop... broken? Ekran... no work. Teşekkürler!", "Hello! Sorry, Türkçe az. Computer problem, please help.", "Merhaba! I am from Germany. Laptop kaput!" }, { "Hello! My laptop broke on holiday, can you help?", "Hola! Sorry, my English... small. Computer problem, please help.", "Hello! I'm from Germany. Laptop kaputt!" }),
			haggle = L({ "{price}... okay? Çok güzel?" }, { "{price}... okay? Good price? Bueno?" }),
			reject = L({ "Oh, too expensive. Sorry, sorry." }, { "Oh, too expensive. Sorry." }),
			nag = L({ "Is it ready? Hazır?", "My ferry leaves soon, feribot!" }, { "Is it ready?", "My ferry leaves soon!" }),
			happy = L({ "Wonderful! Çok teşekkürler! Türkiye çok güzel!", "Amazing service! Five stars!" }, { "Wonderful! Thank you so much! Gracias!", "Amazing service! Five stars!" }),
			angry = L({ "Sorry, my tour bus... bye bye." }, { "Sorry, my tour bus is leaving... bye." }),
		},
	},
	{
		id = "shady", weight = 3, level = 3, name = { tr = "Şüpheli Satıcı", en = "Shady Seller" },
		device = { laptopChance = 0.5, tiers = { "mid", "high" }, classes = { "gaming15" } },
		budget = 1.0, patience = 0.7, haggle = 0.6, tip = 0, harsh = 0.3, look = "shady", special = "stolen_offer",
		lines = {
			greet = L({ "Psst... usta, sana çok ucuza ekran kartı lazım mı?", "Faturası yok ama sağlam mal, bak bir.", "Sorma nereden, al kullan. Yarı fiyatına." }, { "Psst... need a really cheap graphics card?", "No receipt, but it's solid, take a look.", "Don't ask where from. Half price." }),
			haggle = L({ "{price} ver, kimse bilmez." }, { "Give me {price}, nobody will know." }),
			reject = L({ "Peki, başka tamirci bulurum." }, { "Fine, I'll find another tech." }),
			nag = L({ "Polis gelmeden karar ver.", "Etrafa bakıp duruyorsun, rahat ol." }, { "Decide before the cops show up.", "Stop looking around, relax." }),
			happy = L({ "Aramızda kalsın." }, { "Keep it between us." }),
			angry = L({ "Kaybedersin, ben gidiyorum." }, { "Your loss, I'm leaving." }),
		},
	},
	{
		id = "scammer", weight = 3, level = 3, name = { tr = "Dolandırıcı", en = "Scammer" },
		device = { laptopChance = 0.5, tiers = { "budget", "mid" }, classes = { "budget15", "gaming15" } },
		budget = 1.1, patience = 1.0, haggle = 0.3, tip = 0, harsh = 0.8, look = "casual", special = "refund_scam",
		lines = {
			greet = L({ "Merhaba, tamir istiyorum, nakit vereceğim.", "Acil değil, ama dikkatli olun lütfen, çok değerli.", "Sadece küçük bir sorun var, hemen hallolur." }, { "Hi, I'd like a repair, I'll pay cash.", "Not urgent, but please be careful, it's very valuable.", "Just a small issue, should be quick." }),
			haggle = L({ "{price} olsun, nakit." }, { "{price}, cash." }),
			reject = L({ "Peki, başka zaman." }, { "OK, another time." }),
			nag = L({ "Bilgisayarım çizilmesin sakın.", "Fotoğrafını çektim bu arada, bilginiz olsun." }, { "Don't you scratch my computer.", "I photographed it, just so you know." }),
			happy = L({ "Bir dakika... burada çizik var! Paramı geri istiyorum!" }, { "Wait... there's a scratch here! I want my money back!" }),
			angry = L({ "Sizi mahkemeye vereceğim!" }, { "I'll take you to court!" }),
		},
	},
	{
		id = "kid", weight = 5, level = 1, name = { tr = "Çocuk ve Velisi", en = "Kid with Parent" },
		device = { laptopChance = 0.5, tiers = { "budget", "office" }, classes = { "budget15" } },
		budget = 0.95, patience = 0.9, haggle = 0.3, tip = 0.25, harsh = 0.3, look = "kid",
		lines = {
			greet = L({ "Babamın bilgisayarını bozdum, o gelmeden yapar mısın?", "Minecraft açarken bir ses çıktı, sonra kapandı.", "Annem 'harçlığından ödersin' dedi..." }, { "I broke my dad's computer, can you fix it before he's home?", "There was a noise opening Minecraft, then it died.", "Mom said I'd pay from my allowance..." }),
			haggle = L({ "Kumbaramda {price} var, olur mu?" }, { "I've got {price} in my piggy bank, OK?" }),
			reject = L({ "O kadar param yok... annemi çağırayım." }, { "I don't have that much... I'll get my mom." }),
			nag = L({ "Babam 6'da geliyor!", "Bitince Minecraft açar mısın?" }, { "Dad's home at six!", "Can you open Minecraft when it's done?" }),
			happy = L({ "Yaşasın! Babam fark etmeyecek!", "Sen bir kahramansın!" }, { "Hooray! Dad won't notice!", "You're a hero!" }),
			angry = L({ "Babam geldi bile... yandım." }, { "Dad's already home... I'm toast." }),
		},
	},
	{
		id = "teacher", weight = 5, level = 1, name = { tr = "Öğretmen", en = "Teacher" },
		device = { laptopChance = 0.7, tiers = { "office", "budget" }, classes = { "budget15", "business14" } },
		budget = 0.9, patience = 1.4, haggle = 0.3, tip = 0.25, harsh = 0.3, look = "teacher",
		lines = {
			greet = L({ "Merhaba, okulun akıllı tahtası bu laptopa bağlı, ders var.", "Sınav kâğıtları bu bilgisayarda, kaybolmasın.", "Öğrenciler virüs bulaştırdı galiba." }, { "Hi, the school's smartboard runs on this, I have class.", "Exam papers are on it, please don't lose them.", "I think my students gave it a virus." }),
			haggle = L({ "Öğretmen maaşı biliyorsunuz, {price} olur mu?" }, { "You know teacher salaries, would {price} do?" }),
			reject = L({ "Okul bütçesi buna yetmez maalesef." }, { "The school budget won't cover this, sorry." }),
			nag = L({ "Teneffüs bitmeden gitmeliyim.", "Ödevleri okuyarak bekliyorum." }, { "I must go before break ends.", "I'm grading homework while I wait." }),
			happy = L({ "Çok teşekkürler, öğrencilere sizi anlatacağım!", "Aferin, tam not!" }, { "Thank you, I'll tell my students about you!", "Well done, full marks!" }),
			angry = L({ "Derse geç kaldım, maalesef gitmem lazım." }, { "I'm late for class, I have to go." }),
		},
	},
	{
		id = "doctor", weight = 4, level = 2, name = { tr = "Doktor", en = "Doctor" },
		device = { laptopChance = 0.75, tiers = { "mid", "office" }, classes = { "business14", "ultra14" } },
		budget = 1.35, patience = 0.65, haggle = 0.1, tip = 0.35, harsh = 0.45, look = "doctor",
		lines = {
			greet = L({ "Nöbetten çıktım, raporlarım bu bilgisayarda.", "Hastanedeki laptopum, acilen lazım.", "Kısa keseyim, vaktim yok, ameliyatım var." }, { "Just off a night shift, my reports are on this.", "My hospital laptop, needed urgently.", "I'll keep it short, I have surgery." }),
			haggle = L({ "{price} makul." }, { "{price} is reasonable." }),
			reject = L({ "Bu fiyat biraz fazla." }, { "That's a bit much." }),
			nag = L({ "Çağrı cihazım ötüyor...", "Hastane arıyor." }, { "My pager is going off...", "The hospital is calling." }),
			happy = L({ "Teşhisiniz yerindeymiş, meslektaş!", "Hızlı ve temiz, teşekkürler." }, { "Your diagnosis was spot on, colleague!", "Fast and clean, thank you." }),
			angry = L({ "Acil vaka geldi, gitmeliyim." }, { "Emergency case, I have to go." }),
		},
	},
	{
		id = "esports", big = true, weight = 3, level = 5, name = { tr = "E-sporcu", en = "Esports Pro" },
		device = { laptopChance = 0.2, tiers = { "enthusiast", "high" }, classes = { "gaming17" } },
		budget = 1.7, patience = 0.6, haggle = 0.15, tip = 0.45, harsh = 0.75, look = "gamer", builds = true, extraFaultChance = 0.2,
		lines = {
			greet = L({ "Takım antrenmanı 1 saat sonra, 1 ms gecikme bile istemem.", "Final maçı yarın, sistem kusursuz olmalı.", "Sponsor kasası bu, çizik olmasın." }, { "Team practice in an hour, I can't afford 1 ms of lag.", "The final is tomorrow, the system must be flawless.", "It's a sponsor case, no scratches." }),
			haggle = L({ "Takım öder, {price} uygun." }, { "The team pays, {price} is fine." }),
			reject = L({ "Takım menajeri bu fiyatı onaylamaz." }, { "Our manager won't approve that." }),
			nag = L({ "Koç arıyor.", "Isınma maçları başladı!" }, { "Coach is calling.", "Warm-up matches started!" }),
			happy = L({ "Sistem uçuyor! Kupayı sana adayacağım.", "Pro seviye iş, teşekkürler." }, { "It flies! I'll dedicate the trophy to you.", "Pro-level work, thanks." }),
			angry = L({ "Maçı kaçırdım, bu çok kötü." }, { "I missed the match, that's terrible." }),
		},
	},
	{
		id = "musician", weight = 3, level = 3, name = { tr = "Müzisyen", en = "Musician" },
		device = { laptopChance = 0.6, tiers = { "mid", "high" }, classes = { "ultra14", "business14" } },
		budget = 1.1, patience = 1.0, haggle = 0.35, tip = 0.3, harsh = 0.45, look = "musician",
		lines = {
			greet = L({ "Kayıtta cızırtı oluyor, bilgisayar mı ses kartı mı?", "Konserim var akşam, setlistim bu laptopta.", "Fan sesi kayıtlara giriyor dostum." }, { "There's crackling in recordings, PC or interface?", "I have a gig tonight, my setlist is on this.", "The fan noise ends up in my recordings, mate." }),
			haggle = L({ "Sanatçıya {price} yapalım mı?" }, { "{price} for an artist?" }),
			reject = L({ "Bu fiyata yeni gitar alırım." }, { "That's a new guitar." }),
			nag = L({ "Soundcheck yaklaşıyor.", "Şu ritim bitene kadar biter mi?" }, { "Soundcheck is close.", "Done by the end of this beat?" }),
			happy = L({ "Sessiz ve hızlı, tam istediğim gibi!", "Konsere davetlisin!" }, { "Quiet and fast, exactly what I wanted!", "You're invited to the gig!" }),
			angry = L({ "Soundcheck'i kaçırdım." }, { "I missed soundcheck." }),
		},
	},
	{
		id = "vip", big = true, weight = 3, level = 6, name = { tr = "VIP Müşteri", en = "VIP Client" },
		device = { laptopChance = 0.3, tiers = { "enthusiast", "high" }, classes = { "gaming17", "ultra14" } },
		budget = 2.8, patience = 0.45, haggle = 0, tip = 0.75, harsh = 0.85, look = "business", builds = true, requestChance = 0.4, extraFaultChance = 0.15,
		lines = {
			greet = L({ "Asistanım sizi önerdi. Hızlı ve kusursuz olsun.", "Bu cihaz yönetim kurulu sunumu için, hata kabul etmem." }, { "My assistant recommended you. Fast and flawless, please.", "This machine is for a board presentation. No mistakes." }),
			nag = L({ "Zamanım çok değerli.", "Toplantıya geç kalıyorum." }, { "My time is very valuable.", "I'm going to be late for a meeting." }),
			happy = L({ "Kusursuz. Üstü kalsın, kartvizitinizi alayım.", "Şirketle çalışmak ister misiniz?" }, { "Flawless. Keep the change, and give me your card.", "Would you like to work with my company?" }),
			angry = L({ "Avukatım sizi arayacak." }, { "My lawyer will be calling you." }),
		},
	},
	{
		id = "demanding", difficult = true, weight = 8, level = 2, name = { tr = "Hak Arayan Müşteri", en = "Demanding Customer" }, gender = "f",
		device = { laptopChance = 0.5, tiers = { "mid", "office", "budget" }, classes = { "budget15", "business14" } },
		budget = 0.9, patience = 0.6, haggle = 0.7, tip = 0.03, harsh = 0.95, look = "casual", nag = 20, extraFaultChance = 0.2,
		lines = {
			greet = L({ "Yöneticinizle konuşmak istiyorum, bu cihaz garantideydi!", "Daha önce başka yerde de baktırdım ama beceremediler." }, { "I want to speak to the manager — this was under warranty!", "I took it somewhere else first, and they made it worse." }),
			nag = L({ "Bu kadar uzun sürmemeli.", "Mağazanın puanını değerlendireceğim." }, { "This shouldn't take so long.", "I'll be rating your shop, you know." }),
			happy = L({ "İdare eder. Yine de fiyat yüksek.", "Tamam, bu sefer şikâyet etmeyeceğim." }, { "It'll do. The price is still high.", "Fine, I won't complain this time." }),
			angry = L({ "Şikâyet formunu istiyorum!" }, { "Give me the complaints form!" }),
		},
	},
	{
		id = "regular", weight = 6, level = 2, name = { tr = "Müdavim Müşteri", en = "Loyal Regular" },
		device = { laptopChance = 0.4, tiers = { "budget", "mid", "office" }, classes = { "budget15", "business14" } },
		budget = 1.1, patience = 1.6, haggle = 0.05, tip = 0.45, harsh = 0.12, look = "casual",
		lines = {
			greet = L({ "Yine ben! Sizden başkasına güvenmem.", "Geçen sefer çok memnun kalmıştım, yine buradayım." }, { "It's me again! I wouldn't trust anyone else.", "I was so happy last time, so I'm back." }),
			nag = L({ "Acelem yok, bekleyebilirim.", "Çay içerken bekliyorum." }, { "No rush, I can wait.", "I'll wait with a cup of tea." }),
			happy = L({ "Her zamanki gibi harika! Arkadaşlarıma söylerim.", "Müdavimi olduğuma değer." }, { "Wonderful, as always! I'll tell my friends.", "Being a regular here is worth it." }),
			angry = L({ "Yazık... sizden bunu beklemezdim." }, { "What a shame... I didn't expect this from you." }),
		},
	},
	{
		id = "tycoon", big = true, weight = 2, level = 9, name = { tr = "Şirket Sahibi", en = "Company Owner" },
		device = { laptopChance = 0.2, tiers = { "enthusiast", "high" }, classes = { "gaming17", "business14" } },
		budget = 3.2, patience = 0.5, haggle = 0.05, tip = 0.8, harsh = 0.8, look = "business", builds = true, requestChance = 0.5,
		lines = {
			greet = L({ "Şirketin sunucuları bile bu kadar önemli değil. İşimi halledin.", "Fiyat sorun değil, yeter ki bugün biter." }, { "Even the company servers aren't this important. Handle it.", "Price is no object, as long as it's done today." }),
			nag = L({ "Saniyeler para demek.", "Yönetim kurulu bekliyor." }, { "Seconds are money.", "The board is waiting." }),
			happy = L({ "Mükemmel. Size yıllık bakım sözleşmesi öneririm.", "Çok iyi. Bir ödül hak ettiniz." }, { "Excellent. I'd like to offer you a yearly maintenance contract.", "Very good. You deserve a bonus." }),
			angry = L({ "Bunu unutmayacağım." }, { "I won't forget this." }),
		},
	},
}

-- Lines every archetype can fall back on.
Customers.generic = {
	accept = L({ "Tamam, anlaştık.", "Olur, buyrun.", "Peki, emanet ediyorum.", "Anlaştık, ne zaman biter?" }, { "OK, deal.", "Sure, go ahead.", "Alright, it's in your hands.", "Deal, when will it be done?" }),
	declined = L({ "Peki, başka yere bakarım.", "Anladım, kolay gelsin.", "Hmm, tamam." }, { "OK, I'll look elsewhere.", "I see, have a good day.", "Hmm, fine." }),
	meh = L({ "İdare eder.", "Biraz uzun sürdü ama tamam.", "Fiyat biraz yüksekti." }, { "It'll do.", "Took a while, but OK.", "The price was a bit high." }),
	tip = L({ "Bu da çay paranız.", "Üstü kalsın.", "Emeğinize sağlık, bu da bahşiş." }, { "Here's something for tea.", "Keep the change.", "Thanks for the effort, here's a tip." }),
	waiting = L({ "Oturup bekliyorum.", "Ben şurada bekleyeyim.", "Telefonla oyalanırım." }, { "I'll sit and wait.", "I'll wait over here.", "I'll kill time on my phone." }),
	pickup = L({ "Bitti mi? Harika!", "Hazırmış, bakalım." }, { "Done? Great!", "It's ready, let's see." }),
	notFixed = L({ "Ama hâlâ aynı sorun var!", "Bu çalışmıyor ki!" }, { "But it still has the same problem!", "This doesn't work!" }),
}

Customers.firstNames = {
	m = {
		"James", "Oliver", "Jack", "Harry", "Henry", "George", "Charlie", "Thomas", "William", "Benjamin", "Samuel", "Daniel",
		"Joseph", "Matthew", "Andrew", "Ryan", "Nathan", "Dylan", "Connor", "Owen", "Ethan", "Logan", "Mason", "Carter", "Wyatt",
		"Hudson", "Caleb", "Isaac", "Gavin", "Tyler", "Mateo", "Santiago", "Diego", "Alejandro", "Javier", "Carlos", "Miguel",
		"Pablo", "Rafael", "Joaquin", "Marco", "Luca", "Matteo", "Giovanni", "Alessandro", "Enzo", "Pierre", "Louis", "Antoine",
		"Julien", "Hugo", "Etienne", "Lukas", "Felix", "Jonas", "Maximilian", "Lars", "Stefan", "Sven", "Erik", "Anders", "Bjorn",
		"Olaf", "Jens", "Ivan", "Dmitri", "Pavel", "Milan", "Tomasz", "Marek", "Nikos", "Dimitri", "Yannis", "Arjun", "Rohan",
		"Vikram", "Amit", "Raj", "Kenji", "Hiro", "Takeshi", "Wei", "Jun", "Min-jun", "Haruto", "Omar", "Karim", "Idris", "Kwame",
		"Amadi", "Tariq", "Thiago", "Gabriel", "Noah", "Liam", "Lucas", "Elijah", "Aaron", "Cole", "Finn", "Rhys", "Callum", "Declan",
	},
	f = {
		"Emma", "Olivia", "Ava", "Mia", "Sophia", "Isabella", "Charlotte", "Amelia", "Harper", "Evelyn", "Abigail", "Emily", "Ella",
		"Grace", "Chloe", "Lily", "Hannah", "Zoe", "Nora", "Ruby", "Scarlett", "Violet", "Hazel", "Maya", "Lucia", "Valentina",
		"Camila", "Elena", "Carmen", "Sofia", "Giulia", "Chiara", "Francesca", "Alessia", "Camille", "Manon", "Juliette", "Clara",
		"Greta", "Lena", "Anna", "Marie", "Ingrid", "Astrid", "Freya", "Sigrid", "Olga", "Natasha", "Katya", "Ewa", "Zofia", "Eleni",
		"Maria", "Priya", "Ananya", "Isha", "Meera", "Yuki", "Sakura", "Aiko", "Mei", "Lin", "Soo-ah", "Hana", "Layla", "Amira",
		"Zainab", "Amara", "Ife", "Nia", "Imani", "Beatriz", "Fernanda", "Aoife", "Niamh", "Siobhan", "Imogen", "Poppy", "Daisy",
		"Willow", "Iris", "Jade", "Stella", "Luna", "Aurora", "Eliza", "Clementine", "Matilda", "Rosa",
	},
}

Customers.lastNames = {
	"Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Taylor", "Anderson", "Thomas", "Moore",
	"Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
	"Wright", "Scott", "Green", "Baker", "Adams", "Nelson", "Hill", "Campbell", "Mitchell", "Roberts", "Carter", "Phillips",
	"Evans", "Turner", "Parker", "Collins", "Edwards", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Morgan", "Cooper",
	"Reed", "Bailey", "Bell", "Kelly", "Howard", "Ward", "Cox", "Richardson", "Wood", "Watson", "Brooks", "Bennett", "Gray",
	"Hughes", "Price", "Sanders", "Foster", "Ross", "Henderson", "Coleman", "Jenkins", "Perry", "Powell", "Long", "Patterson",
	"Garcia", "Martinez", "Rodriguez", "Lopez", "Hernandez", "Gonzalez", "Perez", "Sanchez", "Ramirez", "Torres", "Flores",
	"Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Dubois", "Moreau", "Laurent", "Bernard", "Petit", "Fournier",
	"Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Hoffmann", "Jansen", "De Vries", "Bakker", "Visser",
	"Nielsen", "Hansen", "Larsen", "Johansson", "Andersson", "Lindberg", "Novak", "Kowalski", "Nowak", "Ivanov", "Petrov",
	"Papadopoulos", "Silva", "Santos", "Oliveira", "Costa", "Patel", "Sharma", "Singh", "Kumar", "Tanaka", "Suzuki", "Sato",
	"Wang", "Zhang", "Chen", "Kim", "Park", "Nguyen", "Haddad", "Khalil", "Mensah", "Okafor", "O'Brien", "Murray", "MacLeod",
}

-- Foreign visitors (the "tourist" customer): more of the world
Customers.foreignNames = {
	first = {
		m = { "Hans", "Kenji", "Ivan", "Raj", "Chen", "Kwame", "Sven", "Mateo", "Luca", "Pierre", "Omar", "Jin", "Anders", "Diego" },
		f = { "Greta", "Yuki", "Olga", "Priya", "Mei", "Amara", "Ingrid", "Lena", "Chloé", "Giulia", "Layla", "Sakura", "Elena", "Aiko" },
	},
	last = { "Müller", "Tanaka", "Ivanov", "García", "Dubois", "Rossi", "Khan", "Patel", "Wang", "Kim", "Andersson", "Novak", "Kowalski", "Jensen", "Moreau", "Becker", "Costa", "Sato", "Silva", "Haddad" },
}

Customers.byId = {}
for _, a in Customers.archetypes do
	Customers.byId[a.id] = a
end

function Customers.get(id: string)
	return Customers.byId[id]
end

-- Picks a line for an archetype, falling back to the generic pool.
function Customers.line(arch, kind: string, lang: string, rng: Random?, vars: { [string]: any }?): string?
	local pool = arch and arch.lines and arch.lines[kind]
	if not pool then
		pool = Customers.generic[kind]
	end
	if not pool then
		return nil
	end
	local list = if lang == "en" then pool.en else pool.tr
	if not list or #list == 0 then
		return nil
	end
	local s = if rng then list[rng:NextInteger(1, #list)] else list[math.random(1, #list)]
	if vars then
		s = string.gsub(s, "{(%w+)}", function(k)
			local v = vars[k]
			return if v ~= nil then tostring(v) else "{" .. k .. "}"
		end)
	end
	return s
end

-- "Ayşe Yılmaz" / "Hans Müller", and the gender that goes with the first name.
-- gender ("m"/"f") is kept when given (an auntie is always a woman).
function Customers.randomName(rng: Random, foreign: boolean?, gender: string?): (string, string)
	local g = if gender == "m" or gender == "f" then gender else (if rng:NextNumber() < 0.5 then "m" else "f")
	if foreign then
		local f = Customers.foreignNames
		local first = f.first[g]
		return first[rng:NextInteger(1, #first)] .. " " .. f.last[rng:NextInteger(1, #f.last)], g
	end
	local list = Customers.firstNames[g]
	return list[rng:NextInteger(1, #list)] .. " " .. Customers.lastNames[rng:NextInteger(1, #Customers.lastNames)], g
end

return Customers
