-- Devices: laptop models that customers bring in. Desktops are assembled from Data/Parts.
-- class links a laptop to its service parts (Parts "lp_<kind>_<class>").
-- screwBit is the bottom-cover screw head; dcSoldered means the DC jack must be desoldered.

local Devices = {}

Devices.laptops = {
	{ id = "ideapad3", name = "Lenovo IdeaPad 3 15", class = "budget15", mem = "DDR4", ramSlots = 1, soldered = 8, screwBit = "PH0", feetScrews = 0, dcSoldered = true, color = { 120, 124, 132 }, year = 2021, cpu = "Ryzen 5 5500U", gpu = "Radeon Graphics", value = 450 },
	{ id = "hp15s", name = "HP 15s", class = "budget15", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH0", feetScrews = 2, dcSoldered = true, color = { 196, 198, 204 }, year = 2021, cpu = "Core i5-1135G7", gpu = "Iris Xe", value = 480 },
	{ id = "aspire5", name = "Acer Aspire 5", class = "budget15", mem = "DDR4", ramSlots = 1, soldered = 8, screwBit = "PH0", feetScrews = 0, dcSoldered = false, color = { 90, 92, 98 }, year = 2022, cpu = "Core i5-1235U", gpu = "Iris Xe", value = 520 },
	{ id = "nirvana", name = "Casper Nirvana C500", class = "budget15", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = true, color = { 60, 62, 70 }, year = 2022, cpu = "Core i5-1135G7", gpu = "Iris Xe", value = 460 },
	{ id = "xps13", name = "Dell XPS 13", class = "ultra14", mem = "DDR5", ramSlots = 0, soldered = 16, screwBit = "T5", feetScrews = 0, dcSoldered = false, color = { 210, 210, 214 }, year = 2023, cpu = "Core i7-1360P", gpu = "Iris Xe", value = 1100 },
	{ id = "zenbook14", name = "ASUS ZenBook 14 OLED", class = "ultra14", mem = "DDR5", ramSlots = 0, soldered = 16, screwBit = "T5", feetScrews = 0, dcSoldered = false, color = { 40, 52, 80 }, year = 2024, cpu = "Core Ultra 7 155H", gpu = "Arc Graphics", value = 1000 },
	{ id = "thinkpad", name = "Lenovo ThinkPad T14", class = "business14", mem = "DDR4", ramSlots = 1, soldered = 8, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 30, 30, 32 }, year = 2021, cpu = "Ryzen 7 PRO 5850U", gpu = "Radeon Graphics", value = 700 },
	{ id = "elitebook", name = "HP EliteBook 840 G8", class = "business14", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 170, 172, 178 }, year = 2021, cpu = "Core i5-1145G7", gpu = "Iris Xe", value = 650 },
	{ id = "abra", name = "Monster Abra A5 V20", class = "gaming15", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 2, dcSoldered = false, color = { 34, 34, 38 }, year = 2023, cpu = "Core i7-12650H", gpu = "RTX 4060 Laptop", value = 1050 },
	{ id = "tuf15", name = "ASUS TUF Gaming F15", class = "gaming15", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 72, 74, 78 }, year = 2022, cpu = "Core i5-12500H", gpu = "RTX 3050 Laptop", value = 850 },
	{ id = "katana15", name = "MSI Katana 15", class = "gaming15", mem = "DDR5", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 1, dcSoldered = false, color = { 26, 26, 28 }, year = 2023, cpu = "Core i7-13620H", gpu = "RTX 4060 Laptop", value = 1000 },
	{ id = "nitro5", name = "Acer Nitro 5", class = "gaming15", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 28, 28, 30 }, year = 2022, cpu = "Ryzen 7 6800H", gpu = "RTX 3060 Laptop", value = 900 },
	{ id = "legion5", name = "Lenovo Legion 5 Pro", class = "gaming15", mem = "DDR5", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 50, 52, 58 }, year = 2023, cpu = "Ryzen 7 7745HX", gpu = "RTX 4070 Laptop", value = 1400 },
	{ id = "excalibur", name = "Casper Excalibur G770", class = "gaming15", mem = "DDR4", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 2, dcSoldered = false, color = { 22, 22, 26 }, year = 2022, cpu = "Core i7-12700H", gpu = "RTX 3060 Laptop", value = 950 },
	{ id = "strixg17", name = "ASUS ROG Strix G17", class = "gaming17", mem = "DDR5", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 40, 40, 46 }, year = 2023, cpu = "Ryzen 9 7845HX", gpu = "RTX 4070 Laptop", value = 1600 },
	{ id = "tulpar", name = "Monster Tulpar T7 V25", class = "gaming17", mem = "DDR5", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 2, dcSoldered = false, color = { 30, 30, 34 }, year = 2024, cpu = "Core i9-13900HX", gpu = "RTX 4080 Laptop", value = 2200 },
	{ id = "raider", name = "MSI Raider GE78 HX", class = "gaming17", mem = "DDR5", ramSlots = 2, soldered = 0, screwBit = "PH1", feetScrews = 0, dcSoldered = false, color = { 24, 24, 28 }, year = 2024, cpu = "Core i9-14900HX", gpu = "RTX 4090 Laptop", value = 3200 },
}

Devices.laptopById = {}
for _, l in Devices.laptops do
	Devices.laptopById[l.id] = l
end

function Devices.laptop(id: string)
	return Devices.laptopById[id]
end

-- Laptop base dimensions (cm) per class: width, depth, thickness.
Devices.laptopDims = {
	budget15 = { 36, 24, 2.0 },
	ultra14 = { 31, 22, 1.5 },
	business14 = { 32.5, 22.5, 1.8 },
	gaming15 = { 36, 26, 2.5 },
	gaming17 = { 39.5, 28, 2.8 },
}

return Devices
