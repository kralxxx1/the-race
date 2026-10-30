-- RealFurniture: the shop's furniture from the official House Furnishing / House Props packs
-- (library "Interior", made by tools/assets/curate.luau). Every function returns nil when the
-- asset is missing so the caller keeps its own box-built version as the fallback.

local Assets = require(script.Parent.Parent.Util.Assets)

local RealFurniture = {}

local LIB = "Interior"

-- Stands `name` on `cf` (front along -Z), scaled to fit inside w × d studs and under h studs.
-- Returns the model, the scale used and the height it ends up with.
function RealFurniture.fit(parent: Instance, name: string, cf: CFrame, w: number?, d: number?, h: number?): (Model?, number, number)
	local size = Assets.size(LIB, name)
	if not size then
		return nil, 1, 0
	end
	local s = math.huge
	if w and size.X > 0 then
		s = math.min(s, w / size.X)
	end
	if d and size.Z > 0 then
		s = math.min(s, d / size.Z)
	end
	if h and size.Y > 0 then
		s = math.min(s, h / size.Y)
	end
	if s == math.huge then
		s = 1
	end
	s = math.clamp(s, 0.25, 1.4)
	-- furniture is decoration: if placing it fails the caller falls back to its own look
	local ok, model = pcall(Assets.place, parent, LIB, name, cf, s)
	if not ok then
		warn("[RealFurniture] " .. name .. ": " .. tostring(model))
		return nil, 1, 0
	end
	return model, s, size.Y * s
end

-- A sofa you can sit on: the real model with an invisible Seat on its cushions.
function RealFurniture.sofa(parent: Instance, name: string, cf: CFrame, w: number, d: number): Model?
	local m, s = RealFurniture.fit(parent, name, cf, w, d, nil)
	if not m then
		return nil
	end
	local seat = Instance.new("Seat")
	seat.Name = "Seat"
	seat.Anchored = true
	seat.Transparency = 1
	seat.CanCollide = false
	seat.CanQuery = false
	seat.Size = Vector3.new(w * 0.6, 0.3, d * 0.4)
	seat.CFrame = cf * CFrame.new(0, 2.2 * s, -0.4 * s)
	seat.Parent = m
	return m
end

return RealFurniture
