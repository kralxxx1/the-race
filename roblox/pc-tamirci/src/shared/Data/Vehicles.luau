-- Vehicles: everything you can buy at the dealerships and drive around the city.
-- speed = top speed (studs/s), accel = studs/s², turn = steering response, body = VehicleModels shape.

local Vehicles = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Vehicles.list = {
	-- Bicycle shop
	{ id = "bicycle", dealer = "bicycles", kind = "bicycle", body = "bicycle", name = N("Şehir Bisikleti", "City Bike"), price = 250, level = 1, speed = 38, accel = 22, turn = 3.2, seats = 1, colors = { { 220, 60, 50 }, { 40, 110, 200 }, { 30, 30, 30 }, { 245, 200, 60 } } },
	{ id = "escooter", dealer = "bicycles", kind = "scooter", body = "escooter", name = N("Elektrikli Scooter", "E-Scooter"), price = 600, level = 1, speed = 36, accel = 26, turn = 3.4, seats = 1, colors = { { 30, 30, 30 }, { 240, 240, 240 }, { 30, 160, 120 } } },
	-- Motorcycle dealer
	{ id = "moped", dealer = "bikes", kind = "bike", body = "moped", name = N("Kurye Motoru 110", "Courier Moped 110"), price = 1800, level = 2, speed = 56, accel = 30, turn = 3, seats = 1, colors = { { 200, 30, 40 }, { 240, 240, 240 }, { 30, 70, 160 } }, box = true },
	{ id = "vespina", dealer = "bikes", kind = "bike", body = "vespa", name = N("Piazza 150 Retro", "Piazza 150 Retro"), price = 3500, level = 3, speed = 62, accel = 30, turn = 3, seats = 2, colors = { { 150, 210, 200 }, { 245, 230, 190 }, { 210, 60, 60 }, { 120, 160, 220 } } },
	{ id = "toprak", dealer = "bikes", kind = "bike", body = "enduro", name = N("Terra 450 Enduro", "Terra 450 Enduro"), price = 9000, level = 5, speed = 76, accel = 40, turn = 3.2, seats = 1, colors = { { 240, 120, 30 }, { 40, 40, 40 }, { 30, 90, 200 } } },
	{ id = "ruzgar", dealer = "bikes", kind = "bike", body = "naked", name = N("Gale 250 Naked", "Gale 250 Naked"), price = 8000, level = 4, speed = 82, accel = 42, turn = 3, seats = 2, colors = { { 30, 30, 30 }, { 220, 220, 220 }, { 200, 40, 40 } } },
	{ id = "kartal_chopper", dealer = "bikes", kind = "bike", body = "chopper", name = N("Eagle Chopper 1200", "Eagle Chopper 1200"), price = 15000, level = 7, speed = 86, accel = 36, turn = 2.4, seats = 2, colors = { { 20, 20, 22 }, { 120, 20, 20 }, { 200, 170, 90 } } },
	{ id = "simsek", dealer = "bikes", kind = "bike", body = "sport", name = N("Bolt R6 Racer", "Bolt R6 Racer"), price = 18000, level = 8, speed = 112, accel = 58, turn = 3.4, seats = 2, colors = { { 20, 60, 170 }, { 230, 230, 230 }, { 200, 20, 30 }, { 40, 200, 80 } } },
	-- Car dealer
	{ id = "sahin", dealer = "cars", kind = "car", body = "classic", name = N("Falcon 1.6 (Classic)", "Falcon 1.6 (Classic)"), price = 6000, level = 2, speed = 70, accel = 26, turn = 2.4, seats = 4, colors = { { 240, 240, 236 }, { 200, 30, 30 }, { 40, 60, 120 }, { 30, 30, 30 }, { 120, 140, 80 } } },
	{ id = "dogan", dealer = "cars", kind = "car", body = "classic", name = N("Hawke SLX", "Hawke SLX"), price = 7500, level = 3, speed = 74, accel = 28, turn = 2.5, seats = 4, colors = { { 190, 190, 196 }, { 30, 30, 30 }, { 110, 20, 30 } }, spoiler = true },
	{ id = "kartal_sw", dealer = "cars", kind = "car", body = "wagon", name = N("Eagle Station Wagon", "Eagle Station Wagon"), price = 8000, level = 3, speed = 72, accel = 27, turn = 2.4, seats = 5, colors = { { 230, 226, 214 }, { 70, 90, 60 }, { 90, 60, 40 } } },
	{ id = "minik", dealer = "cars", kind = "car", body = "hatch", name = N("Pico Hatchback", "Pico Hatchback"), price = 12000, level = 4, speed = 80, accel = 34, turn = 2.9, seats = 4, colors = { { 230, 60, 60 }, { 250, 210, 60 }, { 70, 160, 220 }, { 240, 240, 240 } } },
	{ id = "kompakt", dealer = "cars", kind = "car", body = "sedan", name = N("Kompakt Sedan", "Compact Sedan"), price = 18000, level = 5, speed = 86, accel = 34, turn = 2.6, seats = 5, colors = { { 30, 30, 34 }, { 200, 200, 205 }, { 40, 70, 130 }, { 120, 20, 30 } } },
	{ id = "servis_van", dealer = "cars", kind = "car", body = "van", name = N("Servis Vanı (Tamirci)", "Service Van"), price = 22000, level = 5, speed = 72, accel = 26, turn = 2.2, seats = 2, colors = { { 240, 240, 240 }, { 30, 120, 200 }, { 240, 160, 30 } }, livery = true },
	{ id = "dolmus", dealer = "cars", kind = "car", body = "minibus", name = N("Classic Shuttle Van", "Classic Shuttle Van"), price = 25000, level = 6, speed = 68, accel = 22, turn = 2, seats = 8, colors = { { 250, 205, 40 }, { 240, 240, 240 } } },
	{ id = "pikap", dealer = "cars", kind = "car", body = "pickup", name = N("Pikap 4x4", "4x4 Pickup"), price = 30000, level = 7, speed = 82, accel = 32, turn = 2.3, seats = 4, colors = { { 150, 30, 30 }, { 30, 30, 30 }, { 200, 200, 196 }, { 60, 90, 60 } } },
	{ id = "suv", dealer = "cars", kind = "car", body = "suv", name = N("SUV Premium", "Premium SUV"), price = 45000, level = 9, speed = 90, accel = 38, turn = 2.4, seats = 5, colors = { { 20, 20, 24 }, { 240, 240, 240 }, { 70, 80, 90 }, { 30, 50, 90 } } },
	{ id = "elektro", dealer = "cars", kind = "car", body = "electric", name = N("Volt Elektrikli Sedan", "Volt Electric Sedan"), price = 55000, level = 10, speed = 98, accel = 52, turn = 2.8, seats = 5, colors = { { 240, 240, 240 }, { 200, 20, 30 }, { 30, 30, 34 }, { 40, 90, 170 } }, electric = true },
	{ id = "coupe", dealer = "cars", kind = "car", body = "coupe", name = N("Turbo Coupe GT", "Turbo Coupe GT"), price = 70000, level = 12, speed = 108, accel = 50, turn = 3, seats = 2, colors = { { 240, 200, 40 }, { 20, 20, 24 }, { 200, 30, 30 }, { 40, 120, 200 } }, spoiler = true },
	{ id = "limuzin", dealer = "cars", kind = "car", body = "limo", name = N("Limuzin", "Limousine"), price = 160000, level = 16, speed = 80, accel = 26, turn = 1.8, seats = 6, colors = { { 20, 20, 22 }, { 240, 240, 240 } } },
	{ id = "super", dealer = "cars", kind = "car", body = "super", name = N("Thunder Supercar", "Thunder Supercar"), price = 250000, level = 18, speed = 140, accel = 80, turn = 3.2, seats = 2, colors = { { 240, 120, 20 }, { 50, 200, 80 }, { 20, 20, 22 }, { 220, 30, 40 }, { 240, 240, 240 } }, spoiler = true },
}

Vehicles.byId = {}
for _, v in Vehicles.list do
	Vehicles.byId[v.id] = v
end

-- Cars that only the street life drives (not for sale): a city bus, a box truck and a taxi-like
-- van, in the colours of everyday traffic.
Vehicles.street = {
	{ id = "city_bus", kind = "car", body = "bus", name = N("Şehir Otobüsü", "City Bus"), speed = 60, accel = 14, turn = 1.6, seats = 1, colors = { { 40, 110, 200 }, { 200, 50, 40 }, { 240, 240, 240 }, { 30, 140, 90 } } },
	{ id = "box_truck", kind = "car", body = "truck", name = N("Kasa Kamyon", "Box Truck"), speed = 64, accel = 16, turn = 1.8, seats = 1, colors = { { 240, 240, 240 }, { 230, 150, 30 }, { 60, 90, 160 }, { 150, 40, 40 } } },
	{ id = "delivery_van", kind = "car", body = "van", name = N("Dağıtım Vanı", "Delivery Van"), speed = 70, accel = 22, turn = 2.2, seats = 1, colors = { { 240, 240, 240 }, { 40, 110, 200 }, { 230, 80, 40 }, { 250, 210, 50 } } },
	{ id = "taxi_hatch", kind = "car", body = "hatch", name = N("Taksi (Hatchback)", "Taxi (Hatchback)"), speed = 76, accel = 30, turn = 2.8, seats = 1, colors = { { 250, 205, 40 } } },
	{ id = "taxi_wagon", kind = "car", body = "wagon", name = N("Taksi (Station)", "Taxi (Wagon)"), speed = 72, accel = 27, turn = 2.4, seats = 1, colors = { { 250, 205, 40 } } },
}

-- Twenty kinds of police car (the street life drives them with their lights flashing): a body
-- shape, a paint scheme (VehicleModels.LIVERIES), a light bar and the name on the doors.
Vehicles.police = {
	{ id = "patrol_sedan", body = "sedan", paint = "bw", bar = "full", text = "POLICE", name = N("Devriye Sedan", "Patrol Sedan") },
	{ id = "patrol_classic", body = "classic", paint = "blueStripe", bar = "mini", text = "POLICE", name = N("Klasik Devriye", "Classic Patrol") },
	{ id = "patrol_hatch", body = "hatch", paint = "checker", bar = "mini", text = "POLICE", name = N("Şehir Devriyesi (Hatchback)", "City Patrol (Hatchback)") },
	{ id = "patrol_wagon", body = "wagon", paint = "bw", bar = "full", text = "POLICE", name = N("Devriye Station", "Patrol Wagon") },
	{ id = "patrol_suv", body = "suv", paint = "navy", bar = "full", text = "POLICE", name = N("Devriye SUV", "Patrol SUV") },
	{ id = "interceptor", body = "coupe", paint = "blackGold", bar = "grille", text = "INTERCEPTOR", name = N("Müdahale Aracı", "Interceptor") },
	{ id = "highway", body = "sedan", paint = "yellow", bar = "full", text = "HIGHWAY PATROL", name = N("Otoyol Devriyesi", "Highway Patrol") },
	{ id = "k9", body = "suv", paint = "bw", bar = "full", text = "K-9 UNIT", name = N("K-9 Köpek Birimi", "K-9 Unit") },
	{ id = "swat", body = "van", paint = "black", bar = "full", text = "SWAT", name = N("Özel Harekât", "SWAT Van") },
	{ id = "traffic", body = "sedan", paint = "whiteOrange", bar = "mini", text = "TRAFFIC POLICE", name = N("Trafik Polisi", "Traffic Police") },
	{ id = "ranger", body = "pickup", paint = "greenWhite", bar = "full", text = "RANGER", name = N("Orman Polisi (Pikap)", "Ranger Pickup") },
	{ id = "electric", body = "electric", paint = "whiteBlue", bar = "mini", text = "POLICE", name = N("Elektrikli Devriye", "Electric Patrol") },
	{ id = "unmarked", body = "sedan", paint = "grey", bar = "dash", text = "", name = N("Sivil Araç", "Unmarked Sedan") },
	{ id = "unmarked_suv", body = "suv", paint = "darkgrey", bar = "grille", text = "", name = N("Sivil SUV", "Unmarked SUV") },
	{ id = "command", body = "van", paint = "whiteBlue", bar = "full", text = "COMMAND POST", name = N("Komuta Aracı", "Command Post") },
	{ id = "supercar", body = "super", paint = "bw", bar = "grille", text = "POLICE", name = N("Süper Devriye", "Super Patrol") },
	{ id = "transport", body = "minibus", paint = "bw", bar = "full", text = "PRISONER TRANSPORT", name = N("Nakil Aracı", "Prisoner Transport") },
	{ id = "patrol_wagon_blue", body = "wagon", paint = "blueStripe", bar = "mini", text = "POLICE", name = N("Mavi Çizgi Station", "Blue Line Wagon") },
	{ id = "patrol_coupe", body = "coupe", paint = "whiteBlue", bar = "full", text = "POLICE", name = N("Hızlı Devriye", "Fast Patrol") },
	{ id = "chief", body = "limo", paint = "black", bar = "grille", text = "CHIEF OF POLICE", name = N("Polis Şefi Limuzini", "Chief's Limousine") },
}
for _, p in Vehicles.police do
	p.kind = "car"
	p.colors = { { 240, 240, 244 } }
	p.seats = 2
	p.speed = 92
	p.accel = 34
	p.turn = 2.6
end

Vehicles.dealers = {
	cars = N("Oto Galeri", "Car Dealership"),
	bikes = N("Motor Bayi", "Motorcycle Dealer"),
	bicycles = N("Bisiklet & Scooter", "Bikes & Scooters"),
}

function Vehicles.get(id: string)
	return Vehicles.byId[id]
end

-- A random plate: "KXT 4821"
function Vehicles.plate(rng: Random): string
	local letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
	local function letter()
		local i = rng:NextInteger(1, #letters)
		return string.sub(letters, i, i)
	end
	return letter() .. letter() .. letter() .. " " .. tostring(rng:NextInteger(1000, 9999))
end

return Vehicles
