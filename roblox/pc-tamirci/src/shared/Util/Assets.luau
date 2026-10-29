-- Assets: realistic models from the official Roblox packs (assets/*.rbxm, made by
-- tools/assets/curate.luau). Libraries the server builds the world from live in
-- ServerStorage.Assets, the ones clients spawn themselves in ReplicatedStorage.Assets.
-- Every model stands on its pivot (the middle of its bottom face) with its front towards -Z, and
-- carries a "Size" attribute. Callers keep their own simple model as a fallback.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Assets = {}

local function roots(): { Instance }
	local list = {}
	local ok, ss = pcall(function()
		return game:GetService("ServerStorage")
	end)
	local server = ok and ss and ss:FindFirstChild("Assets")
	if server then
		table.insert(list, server)
	end
	local shared = ReplicatedStorage:FindFirstChild("Assets")
	if shared then
		table.insert(list, shared)
	end
	return list
end

-- The template (don't parent or move it), or nil.
function Assets.get(library: string, name: string): Model?
	for _, root in roots() do
		local lib = root:FindFirstChild(library)
		local m = lib and lib:FindFirstChild(name)
		if m and m:IsA("Model") then
			return m
		end
	end
	return nil
end

function Assets.size(library: string, name: string): Vector3?
	local m = Assets.get(library, name)
	local s = m and m:GetAttribute("Size")
	return if typeof(s) == "Vector3" then s else nil
end

-- Names in a library starting with `prefix` (all when nil), sorted.
function Assets.names(library: string, prefix: string?): { string }
	local out = {}
	for _, root in roots() do
		local lib = root:FindFirstChild(library)
		if lib then
			for _, c in lib:GetChildren() do
				if c:IsA("Model") and (not prefix or string.sub(c.Name, 1, #prefix) == prefix) then
					table.insert(out, c.Name)
				end
			end
		end
	end
	table.sort(out)
	return out
end

-- A copy standing on `cf` (front along cf.LookVector), scaled about its foot. nil if missing.
function Assets.place(parent: Instance?, library: string, name: string, cf: CFrame, scale: number?): Model?
	local src = Assets.get(library, name)
	if not src then
		return nil
	end
	local m = src:Clone()
	if scale and math.abs(scale - 1) > 1e-3 then
		m:ScaleTo(scale)
	end
	m:PivotTo(cf)
	m.Parent = parent
	return m
end

-- Scale that makes the asset `height` studs tall.
function Assets.scaleFor(library: string, name: string, height: number): number
	local s = Assets.size(library, name)
	return if s and s.Y > 0 then height / s.Y else 1
end

return Assets
