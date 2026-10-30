-- Marketing: advertising campaigns and brand awareness.
-- A campaign brings more customers for a while (boost) and raises brand awareness ("fame"), which
-- fades slowly when nobody talks about the shop. How busy the shop is:
--   customers per minute = base × (1 + campaign boosts) × (1 + fame × 0.6) × (0.8 + satisfaction × 0.4)
-- Big-spenders (the wealthy, VIPs, company owners) follow fame and the pricier campaigns.

local Marketing = {}

local function N(tr: string, en: string)
	return { tr = tr, en = en }
end

Marketing.campaigns = {
	{ id = "flyers", icon = "📄", level = 1, cost = 150, minutes = 12, boost = 0.15, fame = 1, rich = 0, name = N("Broşür Dağıtımı", "Flyers in the Neighbourhood"), desc = N("Mahallede broşür dağıtılır.", "Hand out flyers around the neighbourhood.") },
	{ id = "social", icon = "📱", level = 2, cost = 450, minutes = 20, boost = 0.25, fame = 2, rich = 0, name = N("Sosyal Medya Paylaşımı", "Social Media Posts"), desc = N("Gençler dükkânı keşfeder.", "Young people discover the shop.") },
	{ id = "radio", icon = "📻", level = 4, cost = 1600, minutes = 30, boost = 0.4, fame = 4, rich = 0.1, name = N("Yerel Radyo Reklamı", "Local Radio Ads"), desc = N("Şehirde herkes duyar.", "The whole town hears about you.") },
	{ id = "billboard", icon = "🪧", level = 6, cost = 4500, minutes = 60, boost = 0.55, fame = 6, rich = 0.25, name = N("Dev Reklam Panosu", "Giant Billboard"), desc = N("Ana caddede dev afiş.", "A huge poster on the main avenue.") },
	{ id = "influencer", icon = "🤳", level = 8, cost = 7500, minutes = 40, boost = 0.7, fame = 8, rich = 0.5, name = N("Fenomen İş Birliği", "Influencer Collab"), desc = N("Fenomenler seni önerir; zenginler gelir.", "Influencers recommend you; wealthy clients follow.") },
	{ id = "tv", icon = "📺", level = 10, cost = 14000, minutes = 60, boost = 1.0, fame = 12, rich = 0.6, name = N("TV Reklam Filmi", "TV Commercial"), desc = N("Prime time'da reklam filmi.", "A commercial in prime time.") },
	{ id = "sponsor", icon = "🏆", level = 13, cost = 32000, minutes = 90, boost = 1.4, fame = 20, rich = 1.0, name = N("E-spor Sponsorluğu", "Esports Sponsorship"), desc = N("Büyük turnuva sponsorluğu.", "Sponsor the big tournament.") },
}
Marketing.byId = {}
for _, c in Marketing.campaigns do
	Marketing.byId[c.id] = c
end

-- campaigns still running: { [id] = seconds left }
function Marketing.active(brand: any, now: number): { [string]: number }
	local out = {}
	for id, untilAt in (brand and brand.ads) or {} do
		local left = untilAt - now
		if left > 0 and Marketing.byId[id] then
			out[id] = left
		end
	end
	return out
end

-- Customer flow multiplier from campaigns, awareness and how happy customers are.
function Marketing.flow(brand: any, now: number): number
	local boost = 0
	for id in Marketing.active(brand, now) do
		boost += Marketing.byId[id].boost
	end
	local fame = math.clamp((brand and brand.fame) or 0, 0, 100) / 100
	local sat = math.clamp((brand and brand.sat) or 70, 0, 100) / 100
	return (1 + boost) * (1 + fame * 0.6) * (0.8 + sat * 0.4)
end

-- How much more often big-spenders show up (1 = normal).
function Marketing.richBias(brand: any, now: number): number
	local bias = 1 + math.clamp((brand and brand.fame) or 0, 0, 100) / 40
	for id in Marketing.active(brand, now) do
		bias += Marketing.byId[id].rich
	end
	return bias
end

-- "Unknown" … "Legendary"
Marketing.tiers = {
	{ 0, N("Bilinmiyor", "Unknown") },
	{ 10, N("Mahallede Tanınan", "Known in the Neighbourhood") },
	{ 25, N("Şehirde Biliniyor", "Known in Town") },
	{ 45, N("Ünlü Marka", "Famous Brand") },
	{ 70, N("Ulusal Marka", "National Brand") },
	{ 90, N("Efsane", "Legendary") },
}
function Marketing.tier(fame: number)
	local out = Marketing.tiers[1]
	for _, t in Marketing.tiers do
		if fame >= t[1] then
			out = t
		end
	end
	return out[2]
end

return Marketing
