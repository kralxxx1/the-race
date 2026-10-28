-- Parts: every component the game knows about.
-- Prices are new street prices (in-game currency); perf values are relative indices
-- (GPU: RTX 4090 = 100, CPU: Ryzen 9 9950X3D = 100). Laptop devices are listed in Data/Devices.

local Parts = {}

export type Part = { [string]: any }

local list: { Part } = {}
local byId: { [string]: Part } = {}
local byCat: { [string]: { Part } } = {}

local function add(p: Part)
	assert(not byId[p.id], "duplicate part id " .. p.id)
	byId[p.id] = p
	table.insert(list, p)
	local c = byCat[p.cat]
	if not c then
		c = {}
		byCat[p.cat] = c
	end
	table.insert(c, p)
	return p
end

----------------------------------------------------------------------------------------------------
-- Graphics cards
-- power: "none" | "6" | "8" | "6+8" | "2x8" | "3x8" | "12v"
----------------------------------------------------------------------------------------------------
local function gpu(id, name, brand, perf, vram, tdp, power, len, fans, slots, year, price, extra)
	local p = {
		id = "gpu_" .. id, cat = "gpu", name = name, brand = brand, perf = perf, vram = vram, tdp = tdp,
		power = power, len = len, fans = fans, slots = slots, year = year, price = price,
	}
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return add(p)
end

-- NVIDIA
gpu("gt710", "GeForce GT 710 2GB", "nvidia", 1.5, 2, 19, "none", 15, 0, 1, 2014, 50, { passive = true, lowProfile = true })
gpu("gt1030", "GeForce GT 1030 2GB", "nvidia", 4, 2, 30, "none", 15, 1, 1, 2017, 80, { lowProfile = true })
gpu("gtx750ti", "GeForce GTX 750 Ti 2GB", "nvidia", 6, 2, 60, "none", 17, 1, 2, 2014, 60)
gpu("gtx960", "GeForce GTX 960 2GB", "nvidia", 9, 2, 120, "6", 24, 2, 2, 2015, 70)
gpu("gtx970", "GeForce GTX 970 4GB", "nvidia", 13, 4, 145, "6+8", 27, 2, 2, 2014, 90)
gpu("gtx1050", "GeForce GTX 1050 2GB", "nvidia", 8, 2, 75, "none", 18, 1, 2, 2016, 90)
gpu("gtx1050ti", "GeForce GTX 1050 Ti 4GB", "nvidia", 10, 4, 75, "none", 18, 1, 2, 2016, 120)
gpu("gtx1060_3", "GeForce GTX 1060 3GB", "nvidia", 15, 3, 120, "6", 25, 2, 2, 2016, 110)
gpu("gtx1060_6", "GeForce GTX 1060 6GB", "nvidia", 17, 6, 120, "6", 25, 2, 2, 2016, 130)
gpu("gtx1070", "GeForce GTX 1070 8GB", "nvidia", 23, 8, 150, "8", 27, 2, 2, 2016, 160)
gpu("gtx1070ti", "GeForce GTX 1070 Ti 8GB", "nvidia", 26, 8, 180, "8", 27, 2, 2, 2017, 180)
gpu("gtx1080", "GeForce GTX 1080 8GB", "nvidia", 28, 8, 180, "8", 27, 2, 2, 2016, 200)
gpu("gtx1080ti", "GeForce GTX 1080 Ti 11GB", "nvidia", 36, 11, 250, "6+8", 28, 3, 2.5, 2017, 280)
gpu("gtx1650", "GeForce GTX 1650 4GB", "nvidia", 13, 4, 75, "none", 20, 2, 2, 2019, 150)
gpu("gtx1650s", "GeForce GTX 1650 Super 4GB", "nvidia", 17, 4, 100, "6", 21, 2, 2, 2019, 170)
gpu("gtx1660", "GeForce GTX 1660 6GB", "nvidia", 19, 6, 120, "8", 23, 2, 2, 2019, 200)
gpu("gtx1660s", "GeForce GTX 1660 Super 6GB", "nvidia", 22, 6, 125, "8", 23, 2, 2, 2019, 220)
gpu("gtx1660ti", "GeForce GTX 1660 Ti 6GB", "nvidia", 22, 6, 120, "8", 23, 2, 2, 2019, 240)
gpu("rtx2060", "GeForce RTX 2060 6GB", "nvidia", 27, 6, 160, "8", 24, 2, 2, 2019, 260)
gpu("rtx2060s", "GeForce RTX 2060 Super 8GB", "nvidia", 31, 8, 175, "8", 25, 2, 2, 2019, 300)
gpu("rtx2070", "GeForce RTX 2070 8GB", "nvidia", 33, 8, 175, "8", 26, 2, 2, 2018, 330)
gpu("rtx2070s", "GeForce RTX 2070 Super 8GB", "nvidia", 38, 8, 215, "6+8", 27, 2, 2.5, 2019, 380)
gpu("rtx2080", "GeForce RTX 2080 8GB", "nvidia", 40, 8, 215, "6+8", 27, 2, 2.5, 2018, 420)
gpu("rtx2080s", "GeForce RTX 2080 Super 8GB", "nvidia", 42, 8, 250, "6+8", 28, 3, 2.5, 2019, 460)
gpu("rtx2080ti", "GeForce RTX 2080 Ti 11GB", "nvidia", 48, 11, 250, "2x8", 30, 3, 2.7, 2018, 550)
gpu("rtx3050", "GeForce RTX 3050 8GB", "nvidia", 24, 8, 130, "8", 22, 2, 2, 2022, 230)
gpu("rtx3060", "GeForce RTX 3060 12GB", "nvidia", 33, 12, 170, "8", 24, 2, 2, 2021, 290)
gpu("rtx3060ti", "GeForce RTX 3060 Ti 8GB", "nvidia", 42, 8, 200, "8", 25, 2, 2, 2020, 360)
gpu("rtx3070", "GeForce RTX 3070 8GB", "nvidia", 47, 8, 220, "2x8", 27, 2, 2.5, 2020, 420)
gpu("rtx3070ti", "GeForce RTX 3070 Ti 8GB", "nvidia", 50, 8, 290, "2x8", 28, 3, 2.7, 2021, 460)
gpu("rtx3080", "GeForce RTX 3080 10GB", "nvidia", 59, 10, 320, "2x8", 31, 3, 2.7, 2020, 580)
gpu("rtx3080ti", "GeForce RTX 3080 Ti 12GB", "nvidia", 64, 12, 350, "3x8", 32, 3, 2.7, 2021, 680)
gpu("rtx3090", "GeForce RTX 3090 24GB", "nvidia", 66, 24, 350, "3x8", 33, 3, 3, 2020, 850)
gpu("rtx3090ti", "GeForce RTX 3090 Ti 24GB", "nvidia", 70, 24, 450, "12v", 33, 3, 3.5, 2022, 1000)
gpu("rtx4060", "GeForce RTX 4060 8GB", "nvidia", 37, 8, 115, "8", 24, 2, 2, 2023, 299)
gpu("rtx4060ti", "GeForce RTX 4060 Ti 8GB", "nvidia", 44, 8, 160, "8", 25, 2, 2, 2023, 399)
gpu("rtx4060ti16", "GeForce RTX 4060 Ti 16GB", "nvidia", 45, 16, 165, "8", 25, 2, 2, 2023, 449)
gpu("rtx4070", "GeForce RTX 4070 12GB", "nvidia", 56, 12, 200, "8", 27, 2, 2.5, 2023, 549)
gpu("rtx4070s", "GeForce RTX 4070 Super 12GB", "nvidia", 64, 12, 220, "12v", 28, 3, 2.5, 2024, 599)
gpu("rtx4070ti", "GeForce RTX 4070 Ti 12GB", "nvidia", 68, 12, 285, "12v", 30, 3, 3, 2023, 749)
gpu("rtx4070tis", "GeForce RTX 4070 Ti Super 16GB", "nvidia", 72, 16, 285, "12v", 30, 3, 3, 2024, 799)
gpu("rtx4080", "GeForce RTX 4080 16GB", "nvidia", 79, 16, 320, "12v", 31, 3, 3, 2022, 1099)
gpu("rtx4080s", "GeForce RTX 4080 Super 16GB", "nvidia", 81, 16, 320, "12v", 31, 3, 3, 2024, 999)
gpu("rtx4090", "GeForce RTX 4090 24GB", "nvidia", 100, 24, 450, "12v", 34, 3, 3.5, 2022, 1599)
gpu("rtx5060", "GeForce RTX 5060 8GB", "nvidia", 43, 8, 145, "8", 24, 2, 2, 2025, 299)
gpu("rtx5060ti", "GeForce RTX 5060 Ti 16GB", "nvidia", 50, 16, 180, "8", 25, 2, 2, 2025, 429)
gpu("rtx5070", "GeForce RTX 5070 12GB", "nvidia", 64, 12, 250, "12v", 27, 3, 2.5, 2025, 549)
gpu("rtx5070ti", "GeForce RTX 5070 Ti 16GB", "nvidia", 80, 16, 300, "12v", 30, 3, 3, 2025, 749)
gpu("rtx5080", "GeForce RTX 5080 16GB", "nvidia", 88, 16, 360, "12v", 31, 3, 3, 2025, 999)
gpu("rtx5090", "GeForce RTX 5090 32GB", "nvidia", 128, 32, 575, "12v", 32, 3, 3.5, 2025, 1999)
-- AMD
gpu("rx550", "Radeon RX 550 4GB", "amd", 5, 4, 50, "none", 17, 1, 2, 2017, 80)
gpu("rx560", "Radeon RX 560 4GB", "amd", 7, 4, 75, "none", 18, 1, 2, 2017, 90)
gpu("rx570", "Radeon RX 570 4GB", "amd", 14, 4, 150, "8", 23, 2, 2, 2017, 100)
gpu("rx580", "Radeon RX 580 8GB", "amd", 16, 8, 185, "8", 24, 2, 2, 2017, 120)
gpu("rx590", "Radeon RX 590 8GB", "amd", 18, 8, 225, "6+8", 27, 2, 2, 2018, 140)
gpu("rx5500xt", "Radeon RX 5500 XT 8GB", "amd", 17, 8, 130, "8", 22, 2, 2, 2019, 180)
gpu("rx5600xt", "Radeon RX 5600 XT 6GB", "amd", 24, 6, 150, "8", 24, 2, 2, 2020, 230)
gpu("rx5700", "Radeon RX 5700 8GB", "amd", 27, 8, 180, "6+8", 26, 2, 2, 2019, 260)
gpu("rx5700xt", "Radeon RX 5700 XT 8GB", "amd", 30, 8, 225, "6+8", 27, 2, 2.5, 2019, 290)
gpu("rx6400", "Radeon RX 6400 4GB", "amd", 11, 4, 53, "none", 16, 1, 1, 2022, 130, { lowProfile = true })
gpu("rx6500xt", "Radeon RX 6500 XT 4GB", "amd", 13, 4, 107, "6", 19, 2, 2, 2022, 150)
gpu("rx6600", "Radeon RX 6600 8GB", "amd", 28, 8, 132, "8", 23, 2, 2, 2021, 200)
gpu("rx6600xt", "Radeon RX 6600 XT 8GB", "amd", 31, 8, 160, "8", 24, 2, 2, 2021, 240)
gpu("rx6650xt", "Radeon RX 6650 XT 8GB", "amd", 33, 8, 180, "8", 25, 2, 2, 2022, 250)
gpu("rx6700xt", "Radeon RX 6700 XT 12GB", "amd", 39, 12, 230, "6+8", 27, 2, 2.5, 2021, 320)
gpu("rx6750xt", "Radeon RX 6750 XT 12GB", "amd", 42, 12, 250, "2x8", 28, 3, 2.5, 2022, 340)
gpu("rx6800", "Radeon RX 6800 16GB", "amd", 50, 16, 250, "2x8", 28, 3, 2.5, 2020, 400)
gpu("rx6800xt", "Radeon RX 6800 XT 16GB", "amd", 56, 16, 300, "2x8", 30, 3, 2.5, 2020, 450)
gpu("rx6900xt", "Radeon RX 6900 XT 16GB", "amd", 60, 16, 300, "2x8", 30, 3, 2.5, 2020, 520)
gpu("rx6950xt", "Radeon RX 6950 XT 16GB", "amd", 63, 16, 335, "3x8", 32, 3, 3, 2022, 560)
gpu("rx7600", "Radeon RX 7600 8GB", "amd", 34, 8, 165, "8", 24, 2, 2, 2023, 260)
gpu("rx7600xt", "Radeon RX 7600 XT 16GB", "amd", 37, 16, 190, "2x8", 26, 2, 2, 2024, 320)
gpu("rx7700xt", "Radeon RX 7700 XT 12GB", "amd", 47, 12, 245, "2x8", 28, 3, 2.5, 2023, 420)
gpu("rx7800xt", "Radeon RX 7800 XT 16GB", "amd", 55, 16, 263, "2x8", 29, 3, 2.5, 2023, 499)
gpu("rx7900gre", "Radeon RX 7900 GRE 16GB", "amd", 60, 16, 260, "2x8", 29, 3, 2.5, 2024, 549)
gpu("rx7900xt", "Radeon RX 7900 XT 20GB", "amd", 69, 20, 315, "2x8", 31, 3, 2.7, 2022, 749)
gpu("rx7900xtx", "Radeon RX 7900 XTX 24GB", "amd", 79, 24, 355, "3x8", 32, 3, 3, 2022, 949)
gpu("rx9060xt", "Radeon RX 9060 XT 16GB", "amd", 49, 16, 160, "8", 25, 2, 2, 2025, 349)
gpu("rx9070", "Radeon RX 9070 16GB", "amd", 70, 16, 220, "2x8", 29, 3, 2.5, 2025, 549)
gpu("rx9070xt", "Radeon RX 9070 XT 16GB", "amd", 78, 16, 304, "3x8", 31, 3, 3, 2025, 599)
-- Intel
gpu("arca380", "Intel Arc A380 6GB", "intel", 12, 6, 75, "8", 20, 1, 2, 2022, 130)
gpu("arca580", "Intel Arc A580 8GB", "intel", 26, 8, 185, "2x8", 25, 2, 2, 2023, 180)
gpu("arca750", "Intel Arc A750 8GB", "intel", 30, 8, 225, "6+8", 27, 2, 2, 2022, 220)
gpu("arca770", "Intel Arc A770 16GB", "intel", 33, 16, 225, "6+8", 27, 2, 2, 2022, 300)
gpu("arcb570", "Intel Arc B570 10GB", "intel", 33, 10, 150, "8", 26, 2, 2, 2025, 219)
gpu("arcb580", "Intel Arc B580 12GB", "intel", 38, 12, 190, "8", 27, 2, 2, 2024, 249)
-- Workstation
gpu("quadrop2000", "Quadro P2000 5GB", "nvidia", 10, 5, 75, "none", 20, 1, 1, 2017, 150, { blower = true, workstation = true })
gpu("rtxa2000", "RTX A2000 12GB", "nvidia", 28, 12, 70, "none", 17, 1, 2, 2021, 450, { blower = true, workstation = true, lowProfile = true })
gpu("rtxa4000", "RTX A4000 16GB", "nvidia", 43, 16, 140, "6", 24, 1, 1, 2021, 1000, { blower = true, workstation = true })
gpu("rtx6000ada", "RTX 6000 Ada 48GB", "nvidia", 92, 48, 300, "12v", 27, 1, 2, 2023, 6800, { blower = true, workstation = true })

----------------------------------------------------------------------------------------------------
-- Processors
----------------------------------------------------------------------------------------------------
local function cpu(id, name, brand, socket, cores, threads, ghz, tdp, igpu, perf, year, price)
	return add({
		id = "cpu_" .. id, cat = "cpu", name = name, brand = brand, socket = socket, cores = cores,
		threads = threads, ghz = ghz, tdp = tdp, igpu = igpu, perf = perf, year = year, price = price,
	})
end

-- Intel
cpu("e8400", "Core 2 Duo E8400", "intel", "LGA775", 2, 2, 3.0, 65, false, 3, 2008, 15)
cpu("q6600", "Core 2 Quad Q6600", "intel", "LGA775", 4, 4, 2.4, 95, false, 5, 2007, 20)
cpu("i5_2500k", "Core i5-2500K", "intel", "LGA1155", 4, 4, 3.7, 95, true, 11, 2011, 30)
cpu("i7_2600k", "Core i7-2600K", "intel", "LGA1155", 4, 8, 3.8, 95, true, 13, 2011, 40)
cpu("i7_3770k", "Core i7-3770K", "intel", "LGA1155", 4, 8, 3.9, 77, true, 15, 2012, 50)
cpu("i5_4460", "Core i5-4460", "intel", "LGA1150", 4, 4, 3.4, 84, true, 13, 2014, 35)
cpu("i7_4790k", "Core i7-4790K", "intel", "LGA1150", 4, 8, 4.4, 88, true, 19, 2014, 70)
cpu("g4560", "Pentium G4560", "intel", "LGA1151", 2, 4, 3.5, 54, true, 9, 2017, 40)
cpu("i3_6100", "Core i3-6100", "intel", "LGA1151", 2, 4, 3.7, 51, true, 10, 2015, 45)
cpu("i5_6600k", "Core i5-6600K", "intel", "LGA1151", 4, 4, 3.9, 91, true, 17, 2015, 60)
cpu("i7_6700k", "Core i7-6700K", "intel", "LGA1151", 4, 8, 4.2, 91, true, 21, 2015, 80)
cpu("i3_8100", "Core i3-8100", "intel", "LGA1151v2", 4, 4, 3.6, 65, true, 16, 2017, 60)
cpu("i5_8400", "Core i5-8400", "intel", "LGA1151v2", 6, 6, 4.0, 65, true, 24, 2017, 90)
cpu("i7_8700k", "Core i7-8700K", "intel", "LGA1151v2", 6, 12, 4.7, 95, true, 31, 2017, 140)
cpu("i9_9900k", "Core i9-9900K", "intel", "LGA1151v2", 8, 16, 5.0, 95, true, 38, 2018, 200)
cpu("i3_10100f", "Core i3-10100F", "intel", "LGA1200", 4, 8, 4.3, 65, false, 22, 2020, 70)
cpu("i5_10400f", "Core i5-10400F", "intel", "LGA1200", 6, 12, 4.3, 65, false, 30, 2020, 110)
cpu("i7_10700k", "Core i7-10700K", "intel", "LGA1200", 8, 16, 5.1, 125, true, 40, 2020, 220)
cpu("i9_10900k", "Core i9-10900K", "intel", "LGA1200", 10, 20, 5.3, 125, true, 45, 2020, 280)
cpu("i5_11400f", "Core i5-11400F", "intel", "LGA1200", 6, 12, 4.4, 65, false, 33, 2021, 120)
cpu("i7_11700k", "Core i7-11700K", "intel", "LGA1200", 8, 16, 5.0, 125, true, 44, 2021, 240)
cpu("i3_12100f", "Core i3-12100F", "intel", "LGA1700", 4, 8, 4.3, 58, false, 32, 2022, 90)
cpu("i5_12400f", "Core i5-12400F", "intel", "LGA1700", 6, 12, 4.4, 65, false, 42, 2022, 130)
cpu("i5_12600k", "Core i5-12600K", "intel", "LGA1700", 10, 16, 4.9, 125, true, 55, 2021, 200)
cpu("i7_12700k", "Core i7-12700K", "intel", "LGA1700", 12, 20, 5.0, 125, true, 65, 2021, 280)
cpu("i9_12900k", "Core i9-12900K", "intel", "LGA1700", 16, 24, 5.2, 241, true, 72, 2021, 380)
cpu("i5_13400f", "Core i5-13400F", "intel", "LGA1700", 10, 16, 4.6, 65, false, 50, 2023, 190)
cpu("i5_13600k", "Core i5-13600K", "intel", "LGA1700", 14, 20, 5.1, 181, true, 70, 2022, 300)
cpu("i7_13700k", "Core i7-13700K", "intel", "LGA1700", 16, 24, 5.4, 253, true, 80, 2022, 400)
cpu("i9_13900k", "Core i9-13900K", "intel", "LGA1700", 24, 32, 5.8, 253, true, 90, 2022, 560)
cpu("i5_14400f", "Core i5-14400F", "intel", "LGA1700", 10, 16, 4.7, 65, false, 52, 2024, 200)
cpu("i5_14600k", "Core i5-14600K", "intel", "LGA1700", 14, 20, 5.3, 181, true, 72, 2023, 320)
cpu("i7_14700k", "Core i7-14700K", "intel", "LGA1700", 20, 28, 5.6, 253, true, 86, 2023, 410)
cpu("i9_14900k", "Core i9-14900K", "intel", "LGA1700", 24, 32, 6.0, 253, true, 93, 2023, 580)
cpu("u5_245k", "Core Ultra 5 245K", "intel", "LGA1851", 14, 14, 5.2, 159, true, 74, 2024, 310)
cpu("u7_265k", "Core Ultra 7 265K", "intel", "LGA1851", 20, 20, 5.5, 250, true, 86, 2024, 400)
cpu("u9_285k", "Core Ultra 9 285K", "intel", "LGA1851", 24, 24, 5.7, 250, true, 95, 2024, 590)
cpu("xeon2680v4", "Xeon E5-2680 v4", "intel", "LGA2011-3", 14, 28, 3.3, 120, false, 30, 2016, 40)
-- AMD
cpu("phenom965", "Phenom II X4 965", "amd", "AM3", 4, 4, 3.4, 125, false, 8, 2009, 20)
cpu("fx8350", "FX-8350", "amd", "AM3+", 8, 8, 4.2, 125, false, 14, 2012, 40)
cpu("a200ge", "Athlon 200GE", "amd", "AM4", 2, 4, 3.2, 35, true, 9, 2018, 50)
cpu("r3_1200", "Ryzen 3 1200", "amd", "AM4", 4, 4, 3.4, 65, false, 14, 2017, 50)
cpu("r5_1600", "Ryzen 5 1600", "amd", "AM4", 6, 12, 3.6, 65, false, 22, 2017, 70)
cpu("r7_1700", "Ryzen 7 1700", "amd", "AM4", 8, 16, 3.7, 65, false, 26, 2017, 90)
cpu("r5_2600", "Ryzen 5 2600", "amd", "AM4", 6, 12, 3.9, 65, false, 25, 2018, 80)
cpu("r7_2700x", "Ryzen 7 2700X", "amd", "AM4", 8, 16, 4.3, 105, false, 31, 2018, 120)
cpu("r5_3400g", "Ryzen 5 3400G", "amd", "AM4", 4, 8, 4.2, 65, true, 22, 2019, 100)
cpu("r3_3100", "Ryzen 3 3100", "amd", "AM4", 4, 8, 3.9, 65, false, 22, 2020, 80)
cpu("r5_3600", "Ryzen 5 3600", "amd", "AM4", 6, 12, 4.2, 65, false, 33, 2019, 100)
cpu("r7_3700x", "Ryzen 7 3700X", "amd", "AM4", 8, 16, 4.4, 65, false, 40, 2019, 160)
cpu("r9_3900x", "Ryzen 9 3900X", "amd", "AM4", 12, 24, 4.6, 105, false, 50, 2019, 250)
cpu("r9_3950x", "Ryzen 9 3950X", "amd", "AM4", 16, 32, 4.7, 105, false, 55, 2019, 350)
cpu("r5_5600g", "Ryzen 5 5600G", "amd", "AM4", 6, 12, 4.4, 65, true, 38, 2021, 130)
cpu("r5_5600", "Ryzen 5 5600", "amd", "AM4", 6, 12, 4.4, 65, false, 42, 2022, 120)
cpu("r5_5600x", "Ryzen 5 5600X", "amd", "AM4", 6, 12, 4.6, 65, false, 44, 2020, 140)
cpu("r7_5700x", "Ryzen 7 5700X", "amd", "AM4", 8, 16, 4.6, 65, false, 50, 2022, 170)
cpu("r7_5800x", "Ryzen 7 5800X", "amd", "AM4", 8, 16, 4.7, 105, false, 53, 2020, 200)
cpu("r7_5800x3d", "Ryzen 7 5800X3D", "amd", "AM4", 8, 16, 4.5, 105, false, 58, 2022, 300)
cpu("r9_5900x", "Ryzen 9 5900X", "amd", "AM4", 12, 24, 4.8, 105, false, 62, 2020, 270)
cpu("r9_5950x", "Ryzen 9 5950X", "amd", "AM4", 16, 32, 4.9, 105, false, 68, 2020, 380)
cpu("r5_7600", "Ryzen 5 7600", "amd", "AM5", 6, 12, 5.1, 65, true, 60, 2023, 200)
cpu("r5_7600x", "Ryzen 5 7600X", "amd", "AM5", 6, 12, 5.3, 105, true, 62, 2022, 220)
cpu("r7_7700x", "Ryzen 7 7700X", "amd", "AM5", 8, 16, 5.4, 105, true, 70, 2022, 300)
cpu("r7_7800x3d", "Ryzen 7 7800X3D", "amd", "AM5", 8, 16, 5.0, 120, true, 80, 2023, 400)
cpu("r9_7900x", "Ryzen 9 7900X", "amd", "AM5", 12, 24, 5.6, 170, true, 82, 2022, 420)
cpu("r9_7950x", "Ryzen 9 7950X", "amd", "AM5", 16, 32, 5.7, 170, true, 92, 2022, 550)
cpu("r9_7950x3d", "Ryzen 9 7950X3D", "amd", "AM5", 16, 32, 5.7, 120, true, 95, 2023, 650)
cpu("r5_9600x", "Ryzen 5 9600X", "amd", "AM5", 6, 12, 5.4, 65, true, 68, 2024, 280)
cpu("r7_9700x", "Ryzen 7 9700X", "amd", "AM5", 8, 16, 5.5, 65, true, 76, 2024, 360)
cpu("r7_9800x3d", "Ryzen 7 9800X3D", "amd", "AM5", 8, 16, 5.2, 120, true, 90, 2024, 480)
cpu("r9_9900x", "Ryzen 9 9900X", "amd", "AM5", 12, 24, 5.6, 120, true, 88, 2024, 500)
cpu("r9_9950x", "Ryzen 9 9950X", "amd", "AM5", 16, 32, 5.7, 170, true, 98, 2024, 650)
cpu("r9_9950x3d", "Ryzen 9 9950X3D", "amd", "AM5", 16, 32, 5.7, 170, true, 100, 2025, 700)
cpu("tr7980x", "Threadripper 7980X", "amd", "sTR5", 64, 128, 5.1, 350, false, 140, 2023, 5000)

----------------------------------------------------------------------------------------------------
-- Motherboards
----------------------------------------------------------------------------------------------------
local function mobo(id, name, brand, socket, chipset, form, mem, slots, m2, wifi, video, year, price, theme)
	return add({
		id = "mb_" .. id, cat = "mobo", name = name, brand = brand, socket = socket, chipset = chipset,
		form = form, mem = mem, memSlots = slots, m2 = m2, wifi = wifi, video = video, year = year,
		price = price, theme = theme or "black",
	})
end

mobo("p5g41", "ASUS P5G41T-M LX", "asus", "LGA775", "G41", "mATX", "DDR3", 2, 0, false, true, 2009, 25, "green")
mobo("m4a88", "ASUS M4A88TD-V EVO", "asus", "AM3", "880G", "ATX", "DDR3", 4, 0, false, true, 2010, 35, "blue")
mobo("ga970", "Gigabyte GA-970A-DS3P", "gigabyte", "AM3+", "970", "ATX", "DDR3", 4, 0, false, false, 2014, 40, "blue")
mobo("h61m", "Gigabyte GA-H61M-S2PV", "gigabyte", "LGA1155", "H61", "mATX", "DDR3", 2, 0, false, true, 2012, 25, "blue")
mobo("p8z68", "ASUS P8Z68-V LX", "asus", "LGA1155", "Z68", "ATX", "DDR3", 4, 0, false, true, 2011, 45, "blue")
mobo("h81m", "ASRock H81M-DGS", "asrock", "LGA1150", "H81", "mATX", "DDR3", 2, 0, false, true, 2014, 25, "black")
mobo("z97g45", "MSI Z97-G45 Gaming", "msi", "LGA1150", "Z97", "ATX", "DDR3", 4, 1, false, true, 2014, 50, "red")
mobo("h110m", "ASUS H110M-K", "asus", "LGA1151", "H110", "mATX", "DDR4", 2, 0, false, true, 2016, 40, "black")
mobo("z270m5", "MSI Z270 Gaming M5", "msi", "LGA1151", "Z270", "ATX", "DDR4", 4, 2, false, true, 2017, 70, "red")
mobo("b360m", "Gigabyte B360M DS3H", "gigabyte", "LGA1151v2", "B360", "mATX", "DDR4", 4, 1, false, true, 2018, 55, "black")
mobo("z390e", "ASUS ROG Strix Z390-E Gaming", "asus", "LGA1151v2", "Z390", "ATX", "DDR4", 4, 2, true, true, 2018, 110, "rog")
mobo("h410m", "ASRock H410M-HDV", "asrock", "LGA1200", "H410", "mATX", "DDR4", 2, 0, false, true, 2020, 55, "black")
mobo("b460m", "MSI B460M PRO-VDH", "msi", "LGA1200", "B460", "mATX", "DDR4", 4, 1, false, true, 2020, 70, "black")
mobo("z490f", "ASUS ROG Strix Z490-F Gaming", "asus", "LGA1200", "Z490", "ATX", "DDR4", 4, 2, false, true, 2020, 160, "rog")
mobo("b560m", "Gigabyte B560M DS3H", "gigabyte", "LGA1200", "B560", "mATX", "DDR4", 4, 2, false, true, 2021, 80, "black")
mobo("z590tw", "MSI MAG Z590 TOMAHAWK WIFI", "msi", "LGA1200", "Z590", "ATX", "DDR4", 4, 3, true, true, 2021, 180, "gray")
mobo("h610m", "ASUS PRIME H610M-E D4", "asus", "LGA1700", "H610", "mATX", "DDR4", 2, 1, false, true, 2022, 80, "black")
mobo("b660m", "MSI PRO B660M-A DDR4", "msi", "LGA1700", "B660", "mATX", "DDR4", 4, 2, false, true, 2022, 120, "gray")
mobo("b760m", "Gigabyte B760M DS3H DDR4", "gigabyte", "LGA1700", "B760", "mATX", "DDR4", 4, 2, false, true, 2023, 110, "black")
mobo("b760tuf", "ASUS TUF GAMING B760-PLUS WIFI", "asus", "LGA1700", "B760", "ATX", "DDR5", 4, 3, true, true, 2023, 170, "tuf")
mobo("b760tw", "MSI MAG B760 TOMAHAWK WIFI", "msi", "LGA1700", "B760", "ATX", "DDR5", 4, 3, true, true, 2023, 180, "gray")
mobo("z690p", "ASUS PRIME Z690-P", "asus", "LGA1700", "Z690", "ATX", "DDR5", 4, 3, false, true, 2021, 180, "white")
mobo("z790edge", "MSI MPG Z790 EDGE WIFI", "msi", "LGA1700", "Z790", "ATX", "DDR5", 4, 4, true, true, 2022, 300, "white")
mobo("z790e", "ASUS ROG STRIX Z790-E GAMING WIFI", "asus", "LGA1700", "Z790", "ATX", "DDR5", 4, 5, true, true, 2022, 400, "rog")
mobo("z790ax", "Gigabyte Z790 AORUS ELITE AX", "gigabyte", "LGA1700", "Z790", "ATX", "DDR5", 4, 4, true, true, 2022, 260, "aorus")
mobo("z790sl", "ASRock Z790 Steel Legend WiFi", "asrock", "LGA1700", "Z790", "ATX", "DDR5", 4, 4, true, true, 2022, 230, "white")
mobo("z790i", "ASUS ROG STRIX Z790-I GAMING WIFI", "asus", "LGA1700", "Z790", "ITX", "DDR5", 2, 2, true, true, 2022, 380, "rog")
mobo("b860p", "MSI PRO B860-P", "msi", "LGA1851", "B860", "ATX", "DDR5", 4, 3, false, true, 2025, 170, "gray")
mobo("z890ax", "Gigabyte Z890 AORUS ELITE WIFI7", "gigabyte", "LGA1851", "Z890", "ATX", "DDR5", 4, 4, true, true, 2024, 300, "aorus")
mobo("z890hero", "ASUS ROG MAXIMUS Z890 HERO", "asus", "LGA1851", "Z890", "ATX", "DDR5", 4, 6, true, true, 2024, 600, "rog")
mobo("a320m", "ASUS PRIME A320M-K", "asus", "AM4", "A320", "mATX", "DDR4", 2, 1, false, true, 2017, 50, "black")
mobo("b350tw", "MSI B350 TOMAHAWK", "msi", "AM4", "B350", "ATX", "DDR4", 4, 1, false, true, 2017, 70, "black")
mobo("b450m", "Gigabyte B450M DS3H", "gigabyte", "AM4", "B450", "mATX", "DDR4", 4, 1, false, true, 2018, 70, "black")
mobo("b450tw", "MSI B450 TOMAHAWK MAX", "msi", "AM4", "B450", "ATX", "DDR4", 4, 1, false, true, 2019, 100, "black")
mobo("x570tuf", "ASUS TUF GAMING X570-PLUS", "asus", "AM4", "X570", "ATX", "DDR4", 4, 2, false, true, 2019, 180, "tuf")
mobo("a520m", "ASRock A520M-HDV", "asrock", "AM4", "A520", "mATX", "DDR4", 2, 1, false, true, 2020, 60, "black")
mobo("b550tw", "MSI MAG B550 TOMAHAWK", "msi", "AM4", "B550", "ATX", "DDR4", 4, 2, false, true, 2020, 160, "gray")
mobo("b550ax", "Gigabyte B550 AORUS ELITE V2", "gigabyte", "AM4", "B550", "ATX", "DDR4", 4, 2, false, true, 2021, 150, "aorus")
mobo("b550i", "ASUS ROG STRIX B550-I GAMING", "asus", "AM4", "B550", "ITX", "DDR4", 2, 2, true, true, 2020, 200, "rog")
mobo("x570hero", "ASUS ROG CROSSHAIR VIII HERO", "asus", "AM4", "X570", "ATX", "DDR4", 4, 2, true, true, 2019, 380, "rog")
mobo("a620m", "ASUS PRIME A620M-E", "asus", "AM5", "A620", "mATX", "DDR5", 2, 1, false, true, 2023, 90, "black")
mobo("b650m", "MSI PRO B650M-A WIFI", "msi", "AM5", "B650", "mATX", "DDR5", 4, 2, true, true, 2023, 150, "gray")
mobo("b650ax", "Gigabyte B650 AORUS ELITE AX", "gigabyte", "AM5", "B650", "ATX", "DDR5", 4, 3, true, true, 2022, 220, "aorus")
mobo("b650tuf", "ASUS TUF GAMING B650-PLUS WIFI", "asus", "AM5", "B650", "ATX", "DDR5", 4, 3, true, true, 2022, 200, "tuf")
mobo("b650e", "ASRock B650E PG Riptide WiFi", "asrock", "AM5", "B650E", "ATX", "DDR5", 4, 3, true, true, 2023, 210, "black")
mobo("x670etw", "MSI MAG X670E TOMAHAWK WIFI", "msi", "AM5", "X670E", "ATX", "DDR5", 4, 4, true, true, 2022, 300, "gray")
mobo("x670ee", "ASUS ROG STRIX X670E-E GAMING WIFI", "asus", "AM5", "X670E", "ATX", "DDR5", 4, 4, true, true, 2022, 450, "rog")
mobo("b850a", "ASUS ROG STRIX B850-A GAMING WIFI", "asus", "AM5", "B850", "ATX", "DDR5", 4, 3, true, true, 2025, 300, "white")
mobo("b850i", "ASRock B850I Lightning WiFi", "asrock", "AM5", "B850", "ITX", "DDR5", 2, 2, true, true, 2025, 220, "black")
mobo("x870ecarbon", "MSI MPG X870E CARBON WIFI", "msi", "AM5", "X870E", "ATX", "DDR5", 4, 4, true, true, 2024, 500, "black")
mobo("x870emaster", "Gigabyte X870E AORUS MASTER", "gigabyte", "AM5", "X870E", "ATX", "DDR5", 4, 4, true, true, 2024, 500, "aorus")
mobo("x99qd4", "Huananzhi X99-QD4", "huananzhi", "LGA2011-3", "X99", "ATX", "DDR4", 4, 1, false, false, 2020, 90, "black")
mobo("trx50", "ASUS Pro WS TRX50-SAGE WIFI", "asus", "sTR5", "TRX50", "ATX", "DDR5", 8, 3, true, false, 2023, 900, "gray")

----------------------------------------------------------------------------------------------------
-- Memory (price is per stick)
----------------------------------------------------------------------------------------------------
local function ram(id, name, mem, form, size, speed, rgb, price, color)
	return add({
		id = "ram_" .. id, cat = "ram", name = name, mem = mem, form = form, size = size, speed = speed,
		rgb = rgb, price = price, color = color or "black",
	})
end

ram("ddr2_2", "Kingston 2GB DDR2 800", "DDR2", "DIMM", 2, 800, false, 8, "green")
ram("ddr3_2", "Kingston 2GB DDR3 1333", "DDR3", "DIMM", 2, 1333, false, 5, "green")
ram("ddr3_4", "Kingston HyperX 4GB DDR3 1600", "DDR3", "DIMM", 4, 1600, false, 10, "blue")
ram("ddr3_8", "Corsair Vengeance 8GB DDR3 1600", "DDR3", "DIMM", 8, 1600, false, 18, "black")
ram("ddr4_4", "Samsung 4GB DDR4 2400", "DDR4", "DIMM", 4, 2400, false, 12, "green")
ram("ddr4_8_2666", "Crucial 8GB DDR4 2666", "DDR4", "DIMM", 8, 2666, false, 18, "green")
ram("ddr4_8_3200", "Kingston Fury Beast 8GB DDR4 3200", "DDR4", "DIMM", 8, 3200, false, 22, "black")
ram("ddr4_16_3200", "Corsair Vengeance LPX 16GB DDR4 3200", "DDR4", "DIMM", 16, 3200, false, 38, "black")
ram("ddr4_16_3600rgb", "G.Skill Trident Z RGB 16GB DDR4 3600", "DDR4", "DIMM", 16, 3600, true, 55, "silver")
ram("ddr4_32_3200", "Kingston Fury Beast 32GB DDR4 3200", "DDR4", "DIMM", 32, 3200, false, 70, "black")
ram("ddr5_8", "Crucial 8GB DDR5 4800", "DDR5", "DIMM", 8, 4800, false, 28, "green")
ram("ddr5_16_5200", "Kingston 16GB DDR5 5200", "DDR5", "DIMM", 16, 5200, false, 45, "green")
ram("ddr5_16_6000", "Kingston Fury Beast 16GB DDR5 6000", "DDR5", "DIMM", 16, 6000, false, 55, "black")
ram("ddr5_16_6000rgb", "G.Skill Trident Z5 RGB 16GB DDR5 6000", "DDR5", "DIMM", 16, 6000, true, 70, "silver")
ram("ddr5_16_6000w", "Corsair Vengeance RGB 16GB DDR5 6000 (Beyaz)", "DDR5", "DIMM", 16, 6000, true, 72, "white")
ram("ddr5_32_6000", "Corsair Vengeance 32GB DDR5 6000", "DDR5", "DIMM", 32, 6000, false, 95, "black")
ram("ddr5_32_6400rgb", "Corsair Dominator Titanium 32GB DDR5 6400", "DDR5", "DIMM", 32, 6400, true, 140, "silver")
ram("ddr5_48_6000", "G.Skill Flare X5 48GB DDR5 6000", "DDR5", "DIMM", 48, 6000, false, 150, "black")
ram("ddr5_64_5600", "Kingston Server Premier 64GB DDR5 5600 ECC", "DDR5", "DIMM", 64, 5600, false, 230, "green")
ram("so_ddr3_4", "SO-DIMM 4GB DDR3L 1600", "DDR3", "SODIMM", 4, 1600, false, 10, "green")
ram("so_ddr4_8", "Kingston SO-DIMM 8GB DDR4 3200", "DDR4", "SODIMM", 8, 3200, false, 20, "green")
ram("so_ddr4_16", "Crucial SO-DIMM 16GB DDR4 3200", "DDR4", "SODIMM", 16, 3200, false, 38, "green")
ram("so_ddr5_8", "Samsung SO-DIMM 8GB DDR5 4800", "DDR5", "SODIMM", 8, 4800, false, 28, "green")
ram("so_ddr5_16", "Kingston Fury Impact 16GB DDR5 5600", "DDR5", "SODIMM", 16, 5600, false, 48, "black")
ram("so_ddr5_32", "Crucial SO-DIMM 32GB DDR5 5600", "DDR5", "SODIMM", 32, 5600, false, 90, "green")

----------------------------------------------------------------------------------------------------
-- Storage. kind: "hdd35" | "hdd25" | "ssd25" | "nvme"
----------------------------------------------------------------------------------------------------
local function storage(id, name, kind, size, speed, price, extra)
	local p = { id = "st_" .. id, cat = "storage", name = name, kind = kind, size = size, speed = speed, price = price }
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return add(p)
end

storage("hdd500", "Seagate Barracuda 500GB 7200rpm", "hdd35", 500, 150, 25)
storage("hdd1t", "WD Blue 1TB 7200rpm", "hdd35", 1000, 180, 40)
storage("hdd2t", "Seagate Barracuda 2TB", "hdd35", 2000, 200, 55)
storage("hdd4t", "WD Blue 4TB", "hdd35", 4000, 190, 85)
storage("hdd8t", "Seagate IronWolf 8TB NAS", "hdd35", 8000, 230, 180)
storage("hdd25_500", "WD Blue 500GB 2.5\" 5400rpm", "hdd25", 500, 100, 25)
storage("hdd25_1t", "Seagate 1TB 2.5\" 5400rpm", "hdd25", 1000, 120, 40)
storage("ssd240", "Kingston A400 240GB SATA SSD", "ssd25", 240, 500, 20)
storage("ssd480", "Kingston A400 480GB SATA SSD", "ssd25", 480, 500, 30)
storage("ssd500evo", "Samsung 870 EVO 500GB", "ssd25", 500, 560, 45)
storage("ssd1tmx", "Crucial MX500 1TB", "ssd25", 1000, 560, 60)
storage("ssd1tevo", "Samsung 870 EVO 1TB", "ssd25", 1000, 560, 80)
storage("ssd2tevo", "Samsung 870 EVO 2TB", "ssd25", 2000, 560, 150)
storage("nv500sn580", "WD Blue SN580 500GB NVMe", "nvme", 500, 4000, 35, { gen = 4 })
storage("nv1tnv2", "Kingston NV2 1TB NVMe", "nvme", 1000, 3500, 55, { gen = 4 })
storage("nv1t970", "Samsung 970 EVO Plus 1TB", "nvme", 1000, 3500, 80, { gen = 3 })
storage("nv1tsn770", "WD Black SN770 1TB", "nvme", 1000, 5150, 70, { gen = 4 })
storage("nv1t990", "Samsung 990 Pro 1TB", "nvme", 1000, 7450, 110, { gen = 4 })
storage("nv2tsn850x", "WD Black SN850X 2TB", "nvme", 2000, 7300, 160, { gen = 4 })
storage("nv2tkc3000", "Kingston KC3000 2TB", "nvme", 2000, 7000, 150, { gen = 4 })
storage("nv4t990", "Samsung 990 Pro 4TB", "nvme", 4000, 7450, 300, { gen = 4 })
storage("nv2tt705", "Crucial T705 2TB Gen5", "nvme", 2000, 14500, 260, { gen = 5 })

----------------------------------------------------------------------------------------------------
-- Power supplies. quality 0..1 drives failure odds and voltage stability.
----------------------------------------------------------------------------------------------------
local function psu(id, name, watt, eff, modular, quality, price, extra)
	local p = { id = "psu_" .. id, cat = "psu", name = name, watt = watt, eff = eff, modular = modular, quality = quality, price = price, form = "ATX" }
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return add(p)
end

psu("turbox500", "Turbox 500W (Markasız)", 500, "Yok", "none", 0.22, 18)
psu("oem300", "HP OEM 300W", 300, "80+", "none", 0.6, 25)
psu("lite450", "Thermaltake Litepower 450W", 450, "Yok", "none", 0.45, 30)
psu("mwe550", "Cooler Master MWE 550 Bronze V2", 550, "Bronze", "none", 0.7, 55)
psu("cv650", "Corsair CV650", 650, "Bronze", "none", 0.66, 60)
psu("pp12m650", "be quiet! Pure Power 12 M 650W", 650, "Gold", "full", 0.86, 95)
psu("rm750e", "Corsair RM750e", 750, "Gold", "full", 0.88, 100)
psu("focus750", "Seasonic Focus GX-750", 750, "Gold", "full", 0.92, 120)
psu("a850gl", "MSI MAG A850GL PCIE5", 850, "Gold", "full", 0.82, 110, { v12 = true })
psu("rm850x", "Corsair RM850x", 850, "Gold", "full", 0.92, 140, { v12 = true })
psu("vertex1000", "Seasonic Vertex GX-1000", 1000, "Gold", "full", 0.93, 190, { v12 = true })
psu("thor1200", "ASUS ROG Thor 1200W Platinum II", 1200, "Platinum", "full", 0.94, 330, { v12 = true })
psu("dpp1300", "be quiet! Dark Power Pro 13 1300W", 1300, "Titanium", "full", 0.96, 400, { v12 = true })
psu("ax1600i", "Corsair AX1600i", 1600, "Titanium", "full", 0.97, 600, { v12 = true })
psu("sf750", "Corsair SF750 (SFX)", 750, "Platinum", "full", 0.93, 170, { form = "SFX", v12 = true })

----------------------------------------------------------------------------------------------------
-- CPU coolers. sockets = "intel" | "amd" | "all"
----------------------------------------------------------------------------------------------------
local function cooler(id, name, kind, rating, sockets, rgb, price, extra)
	local p = { id = "cool_" .. id, cat = "cooler", name = name, kind = kind, rating = rating, sockets = sockets, rgb = rgb, price = price }
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return add(p)
end

cooler("intel_stock", "Intel Stok Soğutucu", "stock", 70, "intel", false, 10)
cooler("amd_stealth", "AMD Wraith Stealth", "stock", 70, "amd", false, 10)
cooler("amd_prism", "AMD Wraith Prism RGB", "stock", 110, "amd", true, 25)
cooler("hyper212", "Cooler Master Hyper 212 Black", "air", 150, "all", false, 35)
cooler("ak400", "DeepCool AK400", "air", 220, "all", false, 35)
cooler("pa120se", "Thermalright Peerless Assassin 120 SE", "air", 245, "all", false, 35, { towers = 2 })
cooler("ak620d", "DeepCool AK620 Digital", "air", 260, "all", true, 70, { towers = 2 })
cooler("nhu12s", "Noctua NH-U12S redux", "air", 180, "all", false, 50, { noctua = true })
cooler("nhd15", "Noctua NH-D15 chromax.black", "air", 250, "all", false, 120, { towers = 2 })
cooler("drp5", "be quiet! Dark Rock Pro 5", "air", 270, "all", false, 95, { towers = 2 })
cooler("lf3_240", "Arctic Liquid Freezer III 240", "aio", 280, "all", false, 85, { radiator = 240 })
cooler("kraken240", "NZXT Kraken 240 RGB", "aio", 260, "all", true, 140, { radiator = 240 })
cooler("lf3_360", "Arctic Liquid Freezer III 360", "aio", 320, "all", false, 110, { radiator = 360 })
cooler("galahad360", "Lian Li Galahad II Trinity 360", "aio", 340, "all", true, 160, { radiator = 360 })
cooler("h150ilcd", "Corsair iCUE H150i ELITE LCD XT", "aio", 360, "all", true, 250, { radiator = 360, lcd = true })

----------------------------------------------------------------------------------------------------
-- Case fans
----------------------------------------------------------------------------------------------------
local function fan(id, name, size, rgb, price, color)
	return add({ id = "fan_" .. id, cat = "fan", name = name, size = size, rgb = rgb, price = price, color = color or "black" })
end

fan("std120", "Standart 120mm Kasa Fanı", 120, false, 5)
fan("p12", "Arctic P12 PWM PST", 120, false, 8)
fan("p14", "Arctic P14 PWM PST", 140, false, 10)
fan("nfa12", "Noctua NF-A12x25", 120, false, 32, "brown")
fan("af120rgb", "Corsair iCUE AF120 RGB", 120, true, 25)
fan("sl120", "Lian Li UNI FAN SL120 V2", 120, true, 28, "white")
fan("sw4", "be quiet! Silent Wings 4 140mm", 140, false, 28)
fan("std80", "80mm Eski Kasa Fanı", 80, false, 4)

----------------------------------------------------------------------------------------------------
-- Cases. forms = supported motherboard forms, gpuMax in cm.
----------------------------------------------------------------------------------------------------
local function case(id, name, style, forms, color, glass, gpuMax, fans, price, extra)
	local p = { id = "case_" .. id, cat = "case", name = name, style = style, forms = forms, color = color, glass = glass, gpuMax = gpuMax, fanSlots = fans, price = price }
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return add(p)
end

case("retro", "Bej Eski Kasa (2005)", "retro", { "ATX", "mATX" }, "beige", false, 26, 1, 10)
case("office", "Ofis Mini Tower", "office", { "mATX", "ITX" }, "black", false, 24, 1, 30)
case("sff", "Ofis SFF Kasa", "sff", { "mATX", "ITX" }, "black", false, 18, 1, 25, { lowProfileOnly = true })
case("q300l", "Cooler Master MasterBox Q300L", "airflow", { "mATX", "ITX" }, "black", true, 33, 4, 45)
case("budgetrgb", "Ekonomik RGB Oyuncu Kasası", "glass", { "ATX", "mATX", "ITX" }, "black", true, 32, 4, 40, { rgb = true })
case("4000d", "Corsair 4000D Airflow", "airflow", { "ATX", "mATX", "ITX" }, "black", true, 36, 6, 95)
case("4000dw", "Corsair 4000D Airflow (Beyaz)", "airflow", { "ATX", "mATX", "ITX" }, "white", true, 36, 6, 95)
case("popair", "Fractal Design Pop Air RGB", "airflow", { "ATX", "mATX", "ITX" }, "black", true, 40, 6, 80, { rgb = true })
case("h5flow", "NZXT H5 Flow", "airflow", { "ATX", "mATX", "ITX" }, "white", true, 36, 6, 95)
case("o11evo", "Lian Li O11 Dynamic EVO", "showcase", { "ATX", "mATX", "ITX" }, "black", true, 42, 10, 160)
case("o11vision", "Lian Li O11 Vision (Beyaz)", "showcase", { "ATX", "mATX", "ITX" }, "white", true, 45, 8, 140)
case("north", "Fractal Design North (Ceviz)", "wood", { "ATX", "mATX", "ITX" }, "black", true, 35, 6, 140, { wood = true })
case("nv7", "Phanteks NV7", "showcase", { "ATX", "mATX", "ITX" }, "black", true, 45, 12, 220)
case("define7xl", "Fractal Design Define 7 XL", "fulltower", { "ATX", "mATX", "ITX" }, "black", false, 49, 9, 230)
case("nr200p", "Cooler Master NR200P (ITX)", "itx", { "ITX" }, "black", true, 33, 2, 90)

----------------------------------------------------------------------------------------------------
-- Consumables and small parts. uses = how many applications one purchase gives.
----------------------------------------------------------------------------------------------------
local function misc(id, name, sub, price, extra)
	local p = { id = id, cat = "misc", sub = sub, name = name, price = price }
	if extra then
		for k, v in extra do
			p[k] = v
		end
	end
	return add(p)
end

misc("paste_arctic_mx4", "Arctic MX-4 Termal Macun", "paste", 8, { uses = 5, paste = 0.82 })
misc("paste_arctic_mx6", "Arctic MX-6 Termal Macun", "paste", 10, { uses = 5, paste = 0.88 })
misc("paste_nth2", "Noctua NT-H2 Termal Macun", "paste", 12, { uses = 5, paste = 0.9 })
misc("paste_kryonaut", "Thermal Grizzly Kryonaut", "paste", 15, { uses = 5, paste = 0.97 })
misc("cmos_cr2032", "CR2032 BIOS Pili", "cmos", 2)
misc("cap_470", "Kondansatör 470µF 16V", "capacitor", 1)
misc("cap_820", "Kondansatör 820µF 6.3V", "capacitor", 1)
misc("cap_1000", "Kondansatör 1000µF 10V", "capacitor", 2)
misc("zip_ties", "Kablo Bağı (50'li)", "zip", 3, { uses = 50 })
misc("solder_wire", "Lehim Teli (Kurşunsuz)", "solder", 5, { uses = 30 })
misc("wifi_ax200", "Intel Wi-Fi 6 AX200 (M.2)", "wifi", 18, { slot = "m2" })
misc("wifi_ax210", "Intel Wi-Fi 6E AX210 (M.2)", "wifi", 22, { slot = "m2" })
misc("wifi_tx3000e", "TP-Link Archer TX3000E (PCIe)", "wifi", 45, { slot = "pcie" })
misc("sata_cable", "SATA Veri Kablosu", "cable", 3)

----------------------------------------------------------------------------------------------------
-- Laptop service parts, matched by laptop class.
-- classes: budget15, ultra14, business14, gaming15, gaming17
----------------------------------------------------------------------------------------------------
local LAPTOP_CLASSES = { "budget15", "ultra14", "business14", "gaming15", "gaming17" }
Parts.LaptopClasses = LAPTOP_CLASSES
local CLASS_LABEL = {
	budget15 = "15.6\" Ekonomik",
	ultra14 = "14\" İnce (Ultrabook)",
	business14 = "14\" İş Serisi",
	gaming15 = "15.6\" Oyuncu",
	gaming17 = "17.3\" Oyuncu",
}
Parts.LaptopClassLabel = CLASS_LABEL

local LAPTOP_PRICES = {
	budget15 = { battery = 35, screen = 55, keyboard = 22, fan = 15, hinge = 12, dcjack = 8 },
	ultra14 = { battery = 60, screen = 120, keyboard = 45, fan = 25, hinge = 25, dcjack = 12 },
	business14 = { battery = 55, screen = 80, keyboard = 35, fan = 20, hinge = 18, dcjack = 10 },
	gaming15 = { battery = 65, screen = 110, keyboard = 50, fan = 30, hinge = 20, dcjack = 12 },
	gaming17 = { battery = 80, screen = 150, keyboard = 60, fan = 35, hinge = 25, dcjack = 14 },
}
local LAPTOP_PART_NAMES = {
	battery = "Batarya",
	screen = "Ekran Paneli",
	keyboard = "Klavye (TR-Q)",
	fan = "Fan + Soğutucu",
	hinge = "Menteşe Seti",
	dcjack = "Şarj Soketi (DC Jack)",
}
for _, cls in LAPTOP_CLASSES do
	for kind, price in LAPTOP_PRICES[cls] do
		add({
			id = "lp_" .. kind .. "_" .. cls,
			cat = "laptop",
			sub = kind,
			lclass = cls,
			name = LAPTOP_PART_NAMES[kind] .. " — " .. CLASS_LABEL[cls],
			price = price,
		})
	end
end

----------------------------------------------------------------------------------------------------
-- Lookup and helpers
----------------------------------------------------------------------------------------------------

Parts.list = list
Parts.byId = byId
Parts.byCat = byCat

Parts.Categories = { "gpu", "cpu", "mobo", "ram", "storage", "psu", "cooler", "fan", "case", "misc", "laptop" }

function Parts.get(id: string): Part?
	return byId[id]
end

function Parts.coolerFits(cooler: Part, socket: string): boolean
	if cooler.sockets == "all" then
		return true
	end
	local amd = socket == "AM4" or socket == "AM5" or socket == "AM3" or socket == "AM3+"
	if cooler.sockets == "amd" then
		return amd and socket ~= "AM3"
	end
	if cooler.sockets == "intel" then
		return not amd and socket ~= "LGA2011-3" and socket ~= "sTR5"
	end
	return false
end

function Parts.caseFits(case: Part, form: string): boolean
	return table.find(case.forms, form) ~= nil
end

-- GPU power connector count shown on the card: returns { "8", "8" } etc.
function Parts.gpuConnectors(gpu: Part): { string }
	local p = gpu.power
	if p == "none" then
		return {}
	elseif p == "6" then
		return { "6" }
	elseif p == "8" then
		return { "8" }
	elseif p == "6+8" then
		return { "6", "8" }
	elseif p == "2x8" then
		return { "8", "8" }
	elseif p == "3x8" then
		return { "8", "8", "8" }
	elseif p == "12v" then
		return { "12v" }
	end
	return {}
end

-- Estimated wall draw used for PSU checks.
function Parts.systemDraw(cpuPart: Part?, gpuPart: Part?): number
	local w = 70
	if cpuPart then
		w += cpuPart.tdp
	end
	if gpuPart then
		w += gpuPart.tdp
	end
	return w
end

-- Short spec line for UIs ("8 GB • 115 W • 2023").
function Parts.spec(p: Part, lang: string?): string
	local en = lang == "en"
	if p.cat == "gpu" then
		return string.format("%d GB VRAM • %d W • %s %d", p.vram, p.tdp, if en then "Perf" else "Güç", math.floor(p.perf))
	elseif p.cat == "cpu" then
		return string.format("%s • %dC/%dT • %.1f GHz • %d W%s", p.socket, p.cores, p.threads, p.ghz, p.tdp, if p.igpu then "" else (if en then " • no iGPU" else " • iGPU yok"))
	elseif p.cat == "mobo" then
		return string.format("%s • %s • %s • %s%s", p.socket, p.chipset, p.form, p.mem, if p.wifi then " • Wi-Fi" else "")
	elseif p.cat == "ram" then
		return string.format("%s %s • %d GB • %d MHz%s", p.mem, p.form, p.size, p.speed, if p.rgb then " • RGB" else "")
	elseif p.cat == "storage" then
		local kind = ({ hdd35 = "HDD 3.5\"", hdd25 = "HDD 2.5\"", ssd25 = "SATA SSD", nvme = "NVMe M.2" })[p.kind]
		return string.format("%s • %s • %d MB/s", kind, if p.size >= 1000 then string.format("%g TB", p.size / 1000) else string.format("%d GB", p.size), p.speed)
	elseif p.cat == "psu" then
		return string.format("%d W • %s • %s", p.watt, p.eff, p.form)
	elseif p.cat == "cooler" then
		return string.format("%s • %d W%s", string.upper(p.kind), p.rating, if p.rgb then " • RGB" else "")
	elseif p.cat == "fan" then
		return string.format("%d mm%s", p.size, if p.rgb then " • RGB" else "")
	elseif p.cat == "case" then
		return string.format("%s • GPU ≤ %d cm", table.concat(p.forms, "/"), p.gpuMax)
	elseif p.cat == "misc" and p.uses then
		return string.format("%d %s", p.uses, if en then "uses" else "kullanım")
	elseif p.cat == "laptop" then
		return CLASS_LABEL[p.lclass]
	end
	return ""
end

return Parts
