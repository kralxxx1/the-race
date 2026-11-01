-- Activities: the things a player can do in the city's venues -- run on a treadmill, lift weights,
-- watch a film, have a coffee, read a book, take a nap, ride the Ferris wheel. Each one is a
-- station (a ProximityPrompt on a piece of equipment, a seat, a counter) that costs a little, takes
-- a few seconds (the player is busy and a progress bar runs) and pays back in a *buff*: a short
-- bonus for the shop (faster bench work, bigger tips, more patient customers, more experience) plus
-- a little experience. So the city is something to play in, not just to drive through.
--
-- The buffs add up (the same buff just starts again) up to a cap; see ActivityService.

local Activities = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

-- effect keys: speed (bench work), tips (tip chance), patience (how long customers wait), xp (experience)
Activities.buffs = {
	fit = { icon = "💪", name = N("Formda", "In shape"), speed = 0.1, minutes = 10 },
	energized = { icon = "⚡", name = N("Enerjik", "Energised"), speed = 0.06, minutes = 6 },
	caffeine = { icon = "☕", name = N("Kafeinli", "Caffeinated"), speed = 0.12, minutes = 5 },
	fed = { icon = "🍽️", name = N("Tok", "Well fed"), patience = 0.2, tips = 0.2, minutes = 12 },
	sweet = { icon = "🍦", name = N("Şekerli", "Sugar rush"), speed = 0.08, minutes = 3 },
	inspired = { icon = "🎬", name = N("İlhamlı", "Inspired"), xp = 0.25, minutes = 10 },
	booked = { icon = "📚", name = N("Kitap Kurdu", "Book smart"), xp = 0.3, minutes = 10 },
	rested = { icon = "😴", name = N("Dinlenmiş", "Well rested"), speed = 0.1, patience = 0.1, minutes = 15 },
	zen = { icon = "🧘", name = N("Sakin", "Zen"), patience = 0.25, minutes = 10 },
	gamer = { icon = "🎮", name = N("Odakta", "In the zone"), speed = 0.08, minutes = 6 },
	sunny = { icon = "☀️", name = N("Güneşli", "Sun-kissed"), tips = 0.3, minutes = 8 },
	thrill = { icon = "🎡", name = N("Heyecanlı", "Thrilled"), xp = 0.15, tips = 0.15, minutes = 8 },
	calm = { icon = "🌳", name = N("Ferah", "Fresh air"), patience = 0.15, minutes = 8 },
	hydrated = { icon = "💧", name = N("Susuz Değil", "Hydrated"), speed = 0.03, minutes = 3 },
	healthy = { icon = "🩺", name = N("Sağlıklı", "Checked up"), speed = 0.04, patience = 0.12, minutes = 15 },
	lucky = { icon = "🍀", name = N("Şanslı", "Lucky"), tips = 0.25, minutes = 6 },
}

-- The most any effect can add up to however many buffs are on.
Activities.cap = { speed = 0.35, tips = 0.6, patience = 0.5, xp = 0.6 }

-- id -> { icon, name, verb (the prompt), venue, cost, seconds, buff, xp, rep, emote (the player's own
-- animation), pose (the motion a patron makes at the station: see DriverPose) }
local list = {
	-- the gym
	{ id = "treadmill", icon = "🏃", venue = "gym", name = N("Koşu Bandı", "Treadmill"), verb = N("Koş", "Run"), cost = 3, seconds = 10, buff = "energized", xp = 4, emote = "cheer", pose = "run" },
	{ id = "bench_press", icon = "🏋️", venue = "gym", name = N("Bench Press", "Bench Press"), verb = N("Ağırlık Kaldır", "Lift"), cost = 5, seconds = 10, buff = "fit", xp = 6, emote = "cheer", pose = "lift" },
	{ id = "dumbbells", icon = "💪", venue = "gym", name = N("Dambıl", "Dumbbells"), verb = N("Dambıl Çek", "Curl"), cost = 3, seconds = 8, buff = "fit", xp = 4, emote = "cheer", pose = "curl" },
	{ id = "squat", icon = "🦵", venue = "gym", name = N("Squat Rafı", "Squat Rack"), verb = N("Squat Yap", "Squat"), cost = 4, seconds = 9, buff = "fit", xp = 5, emote = "cheer", pose = "lift" },
	{ id = "spin_bike", icon = "🚴", venue = "gym", name = N("Spinning Bisikleti", "Spin Bike"), verb = N("Pedal Çevir", "Pedal"), cost = 3, seconds = 10, buff = "energized", xp = 4, emote = "dance", pose = "pedal" },
	{ id = "punching_bag", icon = "🥊", venue = "gym", name = N("Boks Torbası", "Punching Bag"), verb = N("Yumruk At", "Box"), cost = 3, seconds = 8, buff = "energized", xp = 4, emote = "point", pose = "punch" },
	{ id = "yoga", icon = "🧘", venue = "gym", name = N("Yoga Minderi", "Yoga Mat"), verb = N("Esne", "Stretch"), cost = 2, seconds = 10, buff = "zen", xp = 3, emote = "wave", pose = "stretch" },
	{ id = "shake", icon = "🥤", venue = "gym", name = N("Protein Barı", "Protein Bar"), verb = N("Shake Al", "Order a shake"), cost = 6, seconds = 4, buff = "fit", xp = 2, emote = "cheer", pose = "drink" },
	{ id = "water", icon = "💧", venue = "gym", name = N("Su Sebili", "Water Cooler"), verb = N("Su İç", "Drink water"), cost = 0, seconds = 3, buff = "hydrated", xp = 1, emote = "wave", pose = "drink" },
	-- the cinema
	{ id = "movie", icon = "🎬", venue = "cinema", name = N("Sinema Koltuğu", "Cinema Seat"), verb = N("Film İzle", "Watch the film"), cost = 12, seconds = 14, buff = "inspired", xp = 8, rep = 1, emote = "laugh", pose = "watch" },
	{ id = "popcorn", icon = "🍿", venue = "cinema", name = N("Patlamış Mısır", "Popcorn"), verb = N("Mısır Al", "Buy popcorn"), cost = 5, seconds = 4, buff = "sweet", xp = 1, emote = "cheer", pose = "eat" },
	-- the places to eat
	{ id = "meal", icon = "🍔", venue = "diner", name = N("Sıcak Yemek", "Hot Meal"), verb = N("Yemek Ye", "Have a meal"), cost = 14, seconds = 8, buff = "fed", xp = 3, emote = "cheer", pose = "eat" },
	{ id = "coffee", icon = "☕", venue = "diner", name = N("Kahve", "Coffee"), verb = N("Kahve İç", "Have a coffee"), cost = 4, seconds = 4, buff = "caffeine", xp = 1, emote = "wave", pose = "drink" },
	{ id = "pizza", icon = "🍕", venue = "diner", name = N("Pizza Dilimi", "Pizza Slice"), verb = N("Pizza Ye", "Have a slice"), cost = 9, seconds = 6, buff = "fed", xp = 2, emote = "cheer", pose = "eat" },
	{ id = "pastry", icon = "🥐", venue = "diner", name = N("Taze Kruvasan", "Fresh Pastry"), verb = N("Kruvasan Ye", "Have a pastry"), cost = 4, seconds = 4, buff = "sweet", xp = 1, emote = "wave", pose = "eat" },
	{ id = "fish", icon = "🐟", venue = "diner", name = N("Balık & Patates", "Fish & Chips"), verb = N("Balık Ye", "Have fish & chips"), cost = 12, seconds = 7, buff = "fed", xp = 3, emote = "cheer", pose = "eat" },
	{ id = "icecream", icon = "🍦", venue = "diner", name = N("Dondurma", "Ice Cream"), verb = N("Dondurma Ye", "Have an ice cream"), cost = 5, seconds = 4, buff = "sweet", xp = 1, emote = "cheer", pose = "eat" },
	-- the hotel
	{ id = "nap", icon = "🛏️", venue = "hotel", name = N("Otel Odası", "Hotel Room"), verb = N("Biraz Dinlen", "Take a nap"), cost = 20, seconds = 14, buff = "rested", xp = 4, emote = "wave", pose = "sit" },
	{ id = "lobby", icon = "🛋️", venue = "hotel", name = N("Lobi Koltuğu", "Lobby Sofa"), verb = N("Otur", "Sit a while"), cost = 0, seconds = 6, buff = "calm", xp = 1, emote = "wave", pose = "sit" },
	-- reading and gaming
	{ id = "read", icon = "📖", venue = "library", name = N("Okuma Masası", "Reading Table"), verb = N("Kitap Oku", "Read a book"), cost = 0, seconds = 10, buff = "booked", xp = 6, emote = "wave", pose = "read" },
	{ id = "study", icon = "🖥️", venue = "library", name = N("Çalışma Bilgisayarı", "Study Computer"), verb = N("Ders Çalış", "Study"), cost = 0, seconds = 10, buff = "booked", xp = 6, emote = "wave", pose = "type" },
	{ id = "play", icon = "🎮", venue = "cafe_net", name = N("Oyun Bilgisayarı", "Gaming PC"), verb = N("Oyun Oyna", "Play a game"), cost = 4, seconds = 8, buff = "gamer", xp = 3, emote = "cheer", pose = "type" },
	{ id = "esports", icon = "🕹️", venue = "arena", name = N("Turnuva Koltuğu", "Tournament Seat"), verb = N("Maça Çık", "Play a match"), cost = 6, seconds = 10, buff = "gamer", xp = 5, rep = 1, emote = "cheer", pose = "type" },
	-- outdoors
	{ id = "relax", icon = "🪑", venue = "park", name = N("Park Bankı", "Park Bench"), verb = N("Otur & Dinlen", "Sit and relax"), cost = 0, seconds = 8, buff = "calm", xp = 1, emote = "wave", pose = "sit" },
	{ id = "ducks", icon = "🦆", venue = "park", name = N("Göl Kenarı", "Lakeside"), verb = N("Ördekleri Besle", "Feed the ducks"), cost = 1, seconds = 5, buff = "calm", xp = 1, emote = "wave", pose = "feed" },
	{ id = "sunbathe", icon = "☀️", venue = "beach", name = N("Şezlong", "Sun Lounger"), verb = N("Güneşlen", "Sunbathe"), cost = 0, seconds = 12, buff = "sunny", xp = 1, emote = "wave", pose = "sit" },
	{ id = "volleyball", icon = "🏐", venue = "beach", name = N("Voleybol Filesi", "Volleyball Net"), verb = N("Voleybol Oyna", "Play volleyball"), cost = 0, seconds = 8, buff = "energized", xp = 3, emote = "cheer", pose = "lift" },
	{ id = "ride", icon = "🎡", venue = "lunapark", name = N("Dönme Dolap", "Ferris Wheel"), verb = N("Bin", "Take a ride"), cost = 8, seconds = 12, buff = "thrill", xp = 4, emote = "cheer", pose = "watch" },
	{ id = "penalty", icon = "⚽", venue = "stadium", name = N("Penaltı Noktası", "Penalty Spot"), verb = N("Penaltı At", "Take a penalty"), cost = 3, seconds = 6, buff = "energized", xp = 3, emote = "cheer", pose = "kick" },
	{ id = "putt", icon = "⛳", venue = "golf", name = N("Golf Çimi", "Putting Green"), verb = N("Vuruş Yap", "Putt"), cost = 5, seconds = 8, buff = "calm", xp = 2, emote = "point", pose = "putt" },
	{ id = "tennis", icon = "🎾", venue = "tennis", name = N("Tenis Kortu", "Tennis Court"), verb = N("Tenis Oyna", "Play tennis"), cost = 5, seconds = 8, buff = "fit", xp = 4, emote = "cheer", pose = "swing" },
	{ id = "fishing", icon = "🎣", venue = "marina", name = N("İskele", "The Jetty"), verb = N("Olta At", "Go fishing"), cost = 2, seconds = 10, buff = "calm", xp = 2, emote = "wave", pose = "feed" },
	-- the park, the funfair, the pools, the camp, the viewpoint and the rest of the places out of doors
	{ id = "swing", icon = "🧒", venue = "park", name = N("Salıncak", "Swing"), verb = N("Salın", "Have a swing"), cost = 0, seconds = 6, buff = "calm", xp = 1, emote = "cheer", pose = "pedal" },
	{ id = "slide", icon = "🎈", venue = "park", name = N("Kaydırak", "Slide"), verb = N("Kay", "Go down the slide"), cost = 0, seconds = 4, buff = "energized", xp = 1, emote = "cheer", pose = "stretch" },
	{ id = "picnic", icon = "🧺", venue = "park", name = N("Piknik Masası", "Picnic Table"), verb = N("Piknik Yap", "Have a picnic"), cost = 6, seconds = 8, buff = "fed", xp = 2, emote = "wave", pose = "eat" },
	{ id = "carousel", icon = "🎠", venue = "lunapark", name = N("Atlıkarınca", "Carousel"), verb = N("Bin", "Ride the carousel"), cost = 5, seconds = 10, buff = "thrill", xp = 3, emote = "cheer", pose = "watch" },
	{ id = "coaster", icon = "🎢", venue = "lunapark", name = N("Hız Treni", "Roller Coaster"), verb = N("Bilet Al & Bin", "Buy a ticket and ride"), cost = 12, seconds = 12, buff = "thrill", xp = 6, rep = 1, emote = "cheer", pose = "watch" },
	{ id = "cotton_candy", icon = "🍬", venue = "lunapark", name = N("Pamuk Şeker", "Cotton Candy"), verb = N("Pamuk Şeker Al", "Buy cotton candy"), cost = 4, seconds = 4, buff = "sweet", xp = 1, emote = "wave", pose = "eat" },
	{ id = "hotdog", icon = "🌭", venue = "lunapark", name = N("Sosisli", "Hot Dog"), verb = N("Sosisli Ye", "Have a hot dog"), cost = 6, seconds = 5, buff = "fed", xp = 2, emote = "wave", pose = "eat" },
	{ id = "fries", icon = "🍟", venue = "lunapark", name = N("Patates Kızartması", "Loaded Fries"), verb = N("Patates Ye", "Have some fries"), cost = 5, seconds = 5, buff = "fed", xp = 2, emote = "wave", pose = "eat" },
	{ id = "fruit", icon = "🍎", venue = "market", name = N("Taze Meyve", "Fresh Fruit"), verb = N("Meyve Al", "Buy some fruit"), cost = 4, seconds = 4, buff = "healthy", xp = 1, emote = "wave", pose = "eat" },
	{ id = "apple_pick", icon = "🍏", venue = "farm", name = N("Elma Bahçesi", "Orchard"), verb = N("Elma Topla", "Pick apples"), cost = 0, seconds = 6, buff = "calm", xp = 1, emote = "wave", pose = "feed" },
	{ id = "chess", icon = "♟️", venue = "cafe", name = N("Satranç Masası", "Chess Table"), verb = N("Satranç Oyna", "Play chess"), cost = 0, seconds = 10, buff = "gamer", xp = 3, rep = 1, emote = "point", pose = "type" },
	{ id = "ring_toss", icon = "🎯", venue = "lunapark", name = N("Halka Atma", "Ring Toss"), verb = N("Halka At", "Throw the rings"), cost = 3, seconds = 6, buff = "gamer", xp = 2, emote = "cheer", pose = "swing" },
	{ id = "balloon_pop", icon = "🎈", venue = "lunapark", name = N("Balon Patlatma", "Balloon Pop"), verb = N("Balon Patlat", "Pop the balloons"), cost = 3, seconds = 6, buff = "gamer", xp = 2, emote = "cheer", pose = "punch" },
	{ id = "cheer", icon = "📣", venue = "stadium", name = N("Tribün", "The Stands"), verb = N("Maçı İzle", "Watch the match"), cost = 0, seconds = 8, buff = "inspired", xp = 2, emote = "cheer", pose = "watch" },
	{ id = "golf_drive", icon = "🏌️", venue = "golf", name = N("Atış Alanı", "Driving Range"), verb = N("Vuruş At", "Hit a bucket"), cost = 6, seconds = 8, buff = "fit", xp = 3, emote = "point", pose = "swing" },
	{ id = "swim", icon = "🏊", venue = "pool", name = N("Havuz", "Swimming Pool"), verb = N("Yüz", "Go for a swim"), cost = 5, seconds = 10, buff = "fit", xp = 4, emote = "cheer", pose = "stretch" },
	{ id = "campfire", icon = "🔥", venue = "camp", name = N("Kamp Ateşi", "Campfire"), verb = N("Ateşin Başına Otur", "Sit by the fire"), cost = 0, seconds = 8, buff = "calm", xp = 1, emote = "wave", pose = "sit" },
	{ id = "tent_nap", icon = "⛺", venue = "camp", name = N("Çadır", "Tent"), verb = N("Biraz Uyu", "Take a nap"), cost = 0, seconds = 12, buff = "rested", xp = 2, emote = "wave", pose = "sit" },
	{ id = "telescope", icon = "🔭", venue = "viewpoint", name = N("Teleskop", "Telescope"), verb = N("Şehre Bak", "Look at the city"), cost = 0, seconds = 6, buff = "inspired", xp = 2, emote = "point", pose = "watch" },
	{ id = "bbq", icon = "🍖", venue = "camp", name = N("Mangal", "Barbecue"), verb = N("Mangal Yap", "Grill something"), cost = 7, seconds = 8, buff = "fed", xp = 2, emote = "wave", pose = "brew" },
	{ id = "hoops", icon = "🏀", venue = "court", name = N("Basketbol Potası", "Basketball Hoop"), verb = N("Basket At", "Shoot some hoops"), cost = 0, seconds = 8, buff = "energized", xp = 3, emote = "cheer", pose = "lift" },
	{ id = "hose", icon = "🧯", venue = "fire", name = N("İtfaiye Hortumu", "Fire Hose"), verb = N("Hortumu Dene", "Try the hose"), cost = 0, seconds = 6, buff = "energized", xp = 2, emote = "cheer", pose = "punch" },
	{ id = "checkup", icon = "🩺", venue = "clinic", name = N("Check-up", "Check-up"), verb = N("Muayene Ol", "Have a check-up"), cost = 12, seconds = 8, buff = "healthy", xp = 2, emote = "wave", pose = "stretch" },
	{ id = "wish", icon = "🪙", venue = "plaza", name = N("Dilek Çeşmesi", "Wishing Fountain"), verb = N("Bozuk Para At", "Throw a coin"), cost = 1, seconds = 3, buff = "lucky", xp = 1, emote = "wave", pose = "feed" },
	-- calling a friend (the people of the city are the player's friends)
	{ id = "call", icon = "📞", venue = "phone", name = N("Arkadaşını Ara", "Call a friend"), verb = N("Ara", "Call"), cost = 0, seconds = 5, buff = "calm", xp = 1, emote = "wave", pose = "phone" },
}

Activities.list = list
Activities.byId = {}
for _, a in list do
	Activities.byId[a.id] = a
end

function Activities.get(id: string)
	return Activities.byId[id]
end

-- The venues that have activities, in the order the list above gives them.
function Activities.venues(): { string }
	local seen, out = {}, {}
	for _, a in list do
		if not seen[a.venue] then
			seen[a.venue] = true
			table.insert(out, a.venue)
		end
	end
	return out
end

-- What the buffs in `active` ({ [buffId] = expiresAt }) add up to at time `now`: { speed, tips, patience, xp }.
function Activities.effects(active: { [string]: number }?, now: number): { speed: number, tips: number, patience: number, xp: number }
	local sum = { speed = 0, tips = 0, patience = 0, xp = 0 }
	for id, expires in active or {} do
		local b = Activities.buffs[id]
		if b and expires > now then
			for key in sum do
				sum[key] += (b :: any)[key] or 0
			end
		end
	end
	for key, cap in Activities.cap do
		sum[key] = math.min(sum[key], cap)
	end
	return sum
end

return Activities
