-- Rand: deterministic helpers on top of Roblox's Random.
-- Everything procedural (city, customers, devices, market listings) takes an explicit rng so that
-- the same seed always produces the same result on the server and on every client.

local Rand = {}

export type Rng = Random

function Rand.new(seed: number?): Random
	if seed then
		return Random.new(seed)
	end
	return Random.new()
end

-- Stable 31-bit hash of a string (FNV-1a), for turning ids into seeds.
function Rand.hash(s: string): number
	local h = 2166136261
	for i = 1, #s do
		h = bit32.bxor(h, string.byte(s, i))
		h = (h * 16777619) % 4294967296
	end
	return h % 2147483647
end

function Rand.int(rng: Random, a: number, b: number): number
	return rng:NextInteger(a, b)
end

function Rand.range(rng: Random, a: number, b: number): number
	return a + (b - a) * rng:NextNumber()
end

function Rand.chance(rng: Random, p: number): boolean
	return rng:NextNumber() < p
end

function Rand.pick<T>(rng: Random, list: { T }): T
	return list[rng:NextInteger(1, #list)]
end

-- Picks from a list of entries using entry[weightKey] (default "weight") as weight.
function Rand.weighted<T>(rng: Random, list: { T }, weightKey: string?): T
	local key = weightKey or "weight"
	local total = 0
	for _, item in list do
		total += (item :: any)[key] or 1
	end
	local r = rng:NextNumber() * total
	for _, item in list do
		r -= (item :: any)[key] or 1
		if r <= 0 then
			return item
		end
	end
	return list[#list]
end

-- Picks a key of a { [key] = weight } map.
function Rand.weightedKey(rng: Random, weights: { [any]: number }): any
	local keys = {}
	local total = 0
	for k, w in weights do
		table.insert(keys, k)
		total += w
	end
	table.sort(keys, function(a, b)
		return tostring(a) < tostring(b)
	end)
	local r = rng:NextNumber() * total
	for _, k in keys do
		r -= weights[k]
		if r <= 0 then
			return k
		end
	end
	return keys[#keys]
end

function Rand.shuffle<T>(rng: Random, list: { T }): { T }
	for i = #list, 2, -1 do
		local j = rng:NextInteger(1, i)
		list[i], list[j] = list[j], list[i]
	end
	return list
end

-- Normal-ish distribution (sum of uniforms), clamped.
function Rand.gauss(rng: Random, mean: number, spread: number, lo: number?, hi: number?): number
	local v = (rng:NextNumber() + rng:NextNumber() + rng:NextNumber() - 1.5) / 1.5
	local x = mean + v * spread
	if lo then
		x = math.max(lo, x)
	end
	if hi then
		x = math.min(hi, x)
	end
	return x
end

-- Short unique id for runtime objects.
local counter = 0
function Rand.uid(prefix: string?): string
	counter += 1
	return string.format("%s%x%x", prefix or "", counter, math.random(0, 0xFFFF))
end

return Rand
