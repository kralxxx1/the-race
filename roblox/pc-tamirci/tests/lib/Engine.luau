-- Engine: a small headless "Roblox" for tests.
-- Loads the Rojo-built place into a Lune DataModel, adds the engine behaviour Lune doesn't have
-- (signals, services, tweens, humanoids, remotes...) and runs ModuleScripts/Scripts from it with a
-- Roblox-like global environment. Every Instance property access is still validated by Lune against
-- the real Roblox reflection database, which is the point: typos and wrong types fail the tests.

local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local task = require("@lune/task")
local serde = require("@lune/serde")

local Mock = require("./Mock")
local Signal = Mock.Signal

local Engine = {}
Engine.context = "server"
Engine.errors = {}

local Instance = roblox.Instance

----------------------------------------------------------------------------------------------------
-- Per-instance storage for mocked engine state
----------------------------------------------------------------------------------------------------
local store = setmetatable({}, { __mode = "k" })
local function bag(inst)
	local b = store[inst]
	if not b then
		b = {}
		store[inst] = b
	end
	return b
end
Engine.bag = bag

local function eventProp(className: string, name: string)
	roblox.implementProperty(className, name, function(inst)
		local b = bag(inst)
		local key = "ev_" .. name
		if not b[key] then
			b[key] = Signal.new(className .. "." .. name)
		end
		return b[key]
	end)
end

local function signalOf(inst, name)
	return (inst :: any)[name]
end
Engine.signal = signalOf

local function callbackProp(className: string, name: string)
	roblox.implementProperty(className, name, function(inst)
		return bag(inst)["cb_" .. name]
	end, function(inst, value)
		bag(inst)["cb_" .. name] = value
	end)
end

local function valueProp(className: string, name: string, default)
	roblox.implementProperty(className, name, function(inst)
		local v = bag(inst)["v_" .. name]
		if v == nil then
			if type(default) == "function" then
				return default(inst)
			end
			return default
		end
		return v
	end, function(inst, value)
		bag(inst)["v_" .. name] = value
	end)
end
Engine.valueProp = valueProp

----------------------------------------------------------------------------------------------------
-- Events
----------------------------------------------------------------------------------------------------
for _, name in { "ChildAdded", "ChildRemoved", "DescendantAdded", "DescendantRemoving", "AncestryChanged", "Destroying", "Changed", "AttributeChanged" } do
	eventProp("Instance", name)
end
for _, name in { "Touched", "TouchEnded" } do
	eventProp("BasePart", name)
end
for _, name in { "MoveToFinished", "Died", "Running", "StateChanged", "Seated", "HealthChanged", "Jumping", "AnimationPlayed" } do
	eventProp("Humanoid", name)
end
for _, name in { "Triggered", "TriggerEnded", "PromptShown", "PromptHidden", "PromptButtonHoldBegan", "PromptButtonHoldEnded" } do
	eventProp("ProximityPrompt", name)
end
for _, name in { "MouseButton1Click", "MouseButton1Down", "MouseButton1Up", "MouseButton2Click", "Activated", "MouseEnter", "MouseLeave", "InputBegan", "InputEnded", "InputChanged", "MouseWheelForward", "MouseWheelBackward" } do
	eventProp("GuiObject", name)
end
for _, name in { "FocusLost", "Focused", "ReturnPressedFromOnScreenKeyboard" } do
	eventProp("TextBox", name)
end
for _, name in { "OnServerEvent", "OnClientEvent" } do
	eventProp("RemoteEvent", name)
	eventProp("UnreliableRemoteEvent", name)
end
eventProp("BindableEvent", "Event")
for _, name in { "Ended", "Played", "Loaded", "DidLoop" } do
	eventProp("Sound", name)
end
for _, name in { "CharacterAdded", "CharacterRemoving", "CharacterAppearanceLoaded", "Chatted", "Idled" } do
	eventProp("Player", name)
end
for _, name in { "PlayerAdded", "PlayerRemoving" } do
	eventProp("Players", name)
end
for _, name in { "Heartbeat", "RenderStepped", "Stepped", "PreSimulation", "PostSimulation", "PreRender", "PreAnimation" } do
	eventProp("RunService", name)
end
for _, name in { "InputBegan", "InputEnded", "InputChanged", "TouchStarted", "TouchEnded", "TouchMoved", "TouchPinch", "TouchTap", "JumpRequest", "LastInputTypeChanged", "WindowFocused", "WindowFocusReleased" } do
	eventProp("UserInputService", name)
end
for _, name in { "PromptTriggered", "PromptShown", "PromptHidden", "PromptButtonHoldBegan", "PromptButtonHoldEnded" } do
	eventProp("ProximityPromptService", name)
end
eventProp("Seat", "Changed")
eventProp("Workspace", "Changed")
eventProp("Camera", "Changed")
eventProp("TextChannel", "MessageReceived")
eventProp("MarketplaceService", "PromptGamePassPurchaseFinished")
eventProp("MarketplaceService", "PromptProductPurchaseFinished")
eventProp("GuiService", "MenuOpened")

callbackProp("RemoteFunction", "OnServerInvoke")
callbackProp("RemoteFunction", "OnClientInvoke")
callbackProp("BindableFunction", "OnInvoke")
callbackProp("MarketplaceService", "ProcessReceipt")

----------------------------------------------------------------------------------------------------
-- Generic methods
----------------------------------------------------------------------------------------------------
roblox.implementMethod("Instance", "GetPropertyChangedSignal", function(inst, prop)
	local b = bag(inst)
	b.propSignals = b.propSignals or {}
	local s = b.propSignals[prop]
	if not s then
		s = Signal.new("PropertyChanged:" .. tostring(prop))
		b.propSignals[prop] = s
	end
	return s
end)
roblox.implementMethod("Instance", "GetAttributeChangedSignal", function(inst, attr)
	local b = bag(inst)
	b.attrSignals = b.attrSignals or {}
	local s = b.attrSignals[attr]
	if not s then
		s = Signal.new("AttributeChanged:" .. tostring(attr))
		b.attrSignals[attr] = s
	end
	return s
end)
roblox.implementMethod("Instance", "WaitForChild", function(inst, name, timeout)
	local c = inst:FindFirstChild(name)
	if not c and timeout == nil then
		error(string.format("WaitForChild would wait forever: %s.%s", inst:GetFullName(), tostring(name)))
	end
	return c
end)
roblox.implementMethod("Instance", "IsDescendantOf", function(inst, ancestor)
	local p = inst.Parent
	while p do
		if p == ancestor then
			return true
		end
		p = p.Parent
	end
	return false
end)

-- Pivot helpers
local function primaryCFrame(model)
	if model.PrimaryPart then
		return model.PrimaryPart.CFrame
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			return d.CFrame
		end
	end
	return roblox.CFrame.new()
end
roblox.implementMethod("Model", "GetPivot", function(model)
	local b = bag(model)
	if b.pivot then
		return b.pivot
	end
	return primaryCFrame(model)
end)
roblox.implementMethod("Model", "PivotTo", function(model, cf)
	local current = model:GetPivot()
	local delta = cf * current:Inverse()
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CFrame = delta * d.CFrame
		end
	end
	bag(model).pivot = cf
end)
roblox.implementMethod("BasePart", "GetPivot", function(part)
	return part.CFrame
end)
roblox.implementMethod("BasePart", "PivotTo", function(part, cf)
	part.CFrame = cf
end)
roblox.implementMethod("Model", "GetBoundingBox", function(model)
	local minV, maxV
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			local p, s = d.Position, d.Size / 2
			local lo, hi = p - s, p + s
			minV = if minV then minV:Min(lo) else lo
			maxV = if maxV then maxV:Max(hi) else hi
		end
	end
	if not minV then
		return roblox.CFrame.new(), roblox.Vector3.new()
	end
	return roblox.CFrame.new((minV + maxV) / 2), maxV - minV
end)
roblox.implementMethod("Model", "GetExtentsSize", function(model)
	local _, size = model:GetBoundingBox()
	return size
end)
roblox.implementMethod("Model", "AddPersistentPlayer", function() end)
roblox.implementMethod("Model", "RemovePersistentPlayer", function() end)
roblox.implementMethod("Model", "ScaleTo", function() end)
roblox.implementMethod("Model", "GetScale", function()
	return 1
end)
roblox.implementMethod("BasePart", "SetNetworkOwner", function() end)
roblox.implementMethod("BasePart", "SetNetworkOwnershipAuto", function() end)
roblox.implementMethod("BasePart", "GetNetworkOwner", function()
	return nil
end)
roblox.implementMethod("BasePart", "CanSetNetworkOwnership", function()
	return true
end)
roblox.implementMethod("BasePart", "ApplyImpulse", function() end)
roblox.implementMethod("BasePart", "ApplyImpulseAtPosition", function() end)
roblox.implementMethod("BasePart", "ApplyAngularImpulse", function() end)
roblox.implementMethod("BasePart", "GetMass", function(part)
	local s = part.Size
	return s.X * s.Y * s.Z * 0.7
end)
roblox.implementMethod("BasePart", "GetTouchingParts", function()
	return {}
end)
roblox.implementMethod("BasePart", "GetConnectedParts", function()
	return {}
end)
-- Position/Orientation are derived from CFrame in the engine; Lune only stores CFrame
roblox.implementProperty("BasePart", "Position", function(part)
	return part.CFrame.Position
end, function(part, v)
	local cf = part.CFrame
	part.CFrame = cf - cf.Position + v
end)
roblox.implementProperty("BasePart", "Orientation", function(part)
	local x, y, z = part.CFrame:ToOrientation()
	return roblox.Vector3.new(math.deg(x), math.deg(y), math.deg(z))
end, function(part, v)
	part.CFrame = roblox.CFrame.new(part.CFrame.Position) * roblox.CFrame.fromOrientation(math.rad(v.X), math.rad(v.Y), math.rad(v.Z))
end)
valueProp("BasePart", "AssemblyLinearVelocity", roblox.Vector3.new())
valueProp("BasePart", "AssemblyAngularVelocity", roblox.Vector3.new())
valueProp("BasePart", "AssemblyMass", function(part)
	local s = part.Size
	return s.X * s.Y * s.Z * 0.7
end)
valueProp("BasePart", "AssemblyRootPart", function(part)
	return part
end)

-- DataModel
roblox.implementMethod("DataModel", "BindToClose", function(game, fn)
	bag(game).onClose = fn
end)
valueProp("DataModel", "JobId", "lune-test-job")
valueProp("DataModel", "PlaceId", 0)
valueProp("DataModel", "PlaceVersion", 1)

-- Humanoid
roblox.implementMethod("Humanoid", "MoveTo", function(hum, pos, part)
	local b = bag(hum)
	b.moveTarget = pos
	b.moveCount = (b.moveCount or 0) + 1
	local char = hum.Parent
	if char and char:IsA("Model") then
		local root = char:FindFirstChild("HumanoidRootPart")
		if root then
			root.CFrame = roblox.CFrame.new(pos + roblox.Vector3.new(0, 3, 0))
		end
	end
	task.defer(function()
		hum.MoveToFinished:Fire(true)
	end)
end)
roblox.implementMethod("Humanoid", "SetStateEnabled", function() end)
roblox.implementMethod("Humanoid", "GetStateEnabled", function()
	return true
end)
roblox.implementMethod("Humanoid", "ChangeState", function(hum, state)
	bag(hum).state = state
end)
roblox.implementMethod("Humanoid", "GetState", function(hum)
	return bag(hum).state or roblox.Enum.HumanoidStateType.Running
end)
roblox.implementMethod("Humanoid", "ApplyDescription", function() end)
roblox.implementMethod("Humanoid", "GetAppliedDescription", function()
	return Instance.new("HumanoidDescription")
end)
roblox.implementMethod("Humanoid", "UnequipTools", function() end)
roblox.implementMethod("Humanoid", "TakeDamage", function() end)
valueProp("Humanoid", "MoveDirection", roblox.Vector3.new())
valueProp("Humanoid", "FloorMaterial", roblox.Enum.Material.Air)
valueProp("Humanoid", "SeatPart", nil)
local function track()
	local t = {
		IsPlaying = false,
		Looped = false,
		Priority = roblox.Enum.AnimationPriority.Core,
		Speed = 1,
		TimePosition = 0,
		Length = 1,
		Stopped = Signal.new("Stopped"),
		Ended = Signal.new("Ended"),
		DidLoop = Signal.new("DidLoop"),
	}
	function t:Play()
		self.IsPlaying = true
	end
	function t:Stop()
		self.IsPlaying = false
	end
	function t:AdjustSpeed(s)
		self.Speed = s
	end
	function t:AdjustWeight() end
	function t:GetMarkerReachedSignal()
		return Signal.new("Marker")
	end
	function t:Destroy() end
	return t
end
roblox.implementMethod("Animator", "LoadAnimation", function()
	return track()
end)
roblox.implementMethod("Humanoid", "LoadAnimation", function()
	return track()
end)
roblox.implementMethod("Animator", "GetPlayingAnimationTracks", function()
	return {}
end)
roblox.implementMethod("Seat", "Sit", function(seat, hum)
	bag(seat).occupant = hum
end)
roblox.implementMethod("VehicleSeat", "Sit", function(seat, hum)
	bag(seat).occupant = hum
end)
valueProp("Seat", "Occupant", function(seat)
	return bag(seat).occupant
end)
valueProp("VehicleSeat", "Occupant", function(seat)
	return bag(seat).occupant
end)
valueProp("VehicleSeat", "ThrottleFloat", 0)
valueProp("VehicleSeat", "SteerFloat", 0)

-- Remotes
roblox.implementMethod("RemoteEvent", "FireClient", function(re, player, ...)
	local b = bag(re)
	b.sent = b.sent or {}
	table.insert(b.sent, { player = player, args = table.pack(...) })
	if Engine.onFireClient then
		Engine.onFireClient(re, player, ...)
	end
end)
roblox.implementMethod("RemoteEvent", "FireAllClients", function(re, ...)
	local b = bag(re)
	b.sentAll = b.sentAll or {}
	table.insert(b.sentAll, table.pack(...))
	if Engine.onFireAllClients then
		Engine.onFireAllClients(re, ...)
	end
end)
roblox.implementMethod("RemoteEvent", "FireServer", function(re, ...)
	re.OnServerEvent:Fire(Engine.localPlayer, ...)
end)
roblox.implementMethod("UnreliableRemoteEvent", "FireClient", function() end)
roblox.implementMethod("UnreliableRemoteEvent", "FireAllClients", function() end)
roblox.implementMethod("RemoteFunction", "InvokeServer", function(rf, ...)
	local cb = rf.OnServerInvoke
	if not cb then
		error("InvokeServer: no OnServerInvoke")
	end
	return cb(Engine.localPlayer, ...)
end)
roblox.implementMethod("BindableEvent", "Fire", function(be, ...)
	be.Event:Fire(...)
end)
roblox.implementMethod("BindableFunction", "Invoke", function(bf, ...)
	return bf.OnInvoke(...)
end)

-- Sounds, particles, misc
roblox.implementMethod("Sound", "Play", function(s)
	bag(s).playing = true
end)
roblox.implementMethod("Sound", "Stop", function(s)
	bag(s).playing = false
end)
roblox.implementMethod("Sound", "Pause", function() end)
roblox.implementMethod("Sound", "Resume", function() end)
valueProp("Sound", "IsLoaded", true)
valueProp("Sound", "IsPlaying", function(s)
	return bag(s).playing == true
end)
valueProp("Sound", "TimeLength", 1)
roblox.implementMethod("ParticleEmitter", "Emit", function() end)
roblox.implementMethod("ParticleEmitter", "Clear", function() end)
roblox.implementMethod("Player", "Kick", function(p, msg)
	bag(p).kicked = msg or true
end)
roblox.implementMethod("Player", "LoadCharacter", function() end)
roblox.implementMethod("Player", "GetMouse", function()
	return { Hit = roblox.CFrame.new(), Target = nil, X = 0, Y = 0, Icon = "", Button1Down = Signal.new(), Button1Up = Signal.new(), Move = Signal.new() }
end)
roblox.implementMethod("Player", "RequestStreamAroundAsync", function() end)
roblox.implementMethod("Player", "GetFriendsOnline", function()
	return {}
end)
roblox.implementMethod("Player", "IsFriendsWith", function()
	return false
end)
roblox.implementMethod("Player", "GetRankInGroup", function()
	return 0
end)
valueProp("Player", "Character", nil)
valueProp("Player", "LocaleId", "tr-tr")
valueProp("Player", "AccountAge", 100)
valueProp("Player", "MembershipType", roblox.Enum.MembershipType.None)

-- GUI geometry: rough absolute sizes for code that reads them
local VIEW = roblox.Vector2.new(1280, 720)
valueProp("GuiBase2d", "AbsoluteSize", function(g)
	local ok, size = pcall(function()
		return g.Size
	end)
	if ok and size then
		return roblox.Vector2.new(size.X.Scale * VIEW.X + size.X.Offset, size.Y.Scale * VIEW.Y + size.Y.Offset)
	end
	return VIEW
end)
valueProp("GuiBase2d", "AbsolutePosition", roblox.Vector2.new(0, 0))
valueProp("GuiBase2d", "AbsoluteRotation", 0)
valueProp("ScrollingFrame", "AbsoluteCanvasSize", VIEW)
valueProp("ScrollingFrame", "AbsoluteWindowSize", VIEW)
valueProp("TextLabel", "TextBounds", roblox.Vector2.new(100, 20))
valueProp("TextButton", "TextBounds", roblox.Vector2.new(100, 20))
valueProp("TextBox", "TextBounds", roblox.Vector2.new(100, 20))
valueProp("TextLabel", "TextFits", true)
roblox.implementMethod("TextBox", "CaptureFocus", function() end)
roblox.implementMethod("TextBox", "ReleaseFocus", function() end)
roblox.implementMethod("TextBox", "IsFocused", function()
	return false
end)
roblox.implementMethod("GuiObject", "TweenPosition", function()
	return true
end)
roblox.implementMethod("GuiObject", "TweenSize", function()
	return true
end)
roblox.implementMethod("GuiObject", "TweenSizeAndPosition", function()
	return true
end)
roblox.implementMethod("ScrollingFrame", "ScrollToTop", function() end)
roblox.implementMethod("UIListLayout", "ApplyLayout", function() end)
valueProp("UIListLayout", "AbsoluteContentSize", roblox.Vector2.new(300, 600))
valueProp("UIGridLayout", "AbsoluteContentSize", roblox.Vector2.new(300, 600))
valueProp("UIGridStyleLayout", "AbsoluteContentSize", roblox.Vector2.new(300, 600))

-- Camera
valueProp("Camera", "ViewportSize", VIEW)
roblox.implementMethod("Camera", "ViewportPointToRay", function(cam, x, y)
	return { Origin = cam.CFrame.Position, Direction = cam.CFrame.LookVector }
end)
roblox.implementMethod("Camera", "ScreenPointToRay", function(cam, x, y)
	return { Origin = cam.CFrame.Position, Direction = cam.CFrame.LookVector }
end)
roblox.implementMethod("Camera", "WorldToViewportPoint", function(cam, pos)
	return roblox.Vector3.new(640, 360, 10), true
end)
roblox.implementMethod("Camera", "WorldToScreenPoint", function(cam, pos)
	return roblox.Vector3.new(640, 360, 10), true
end)
valueProp("Camera", "Focus", roblox.CFrame.new())

----------------------------------------------------------------------------------------------------
-- Services
----------------------------------------------------------------------------------------------------
roblox.implementMethod("RunService", "IsServer", function()
	return Engine.context == "server"
end)
roblox.implementMethod("RunService", "IsClient", function()
	return Engine.context == "client"
end)
roblox.implementMethod("RunService", "IsStudio", function()
	return true
end)
roblox.implementMethod("RunService", "IsRunning", function()
	return true
end)
roblox.implementMethod("RunService", "IsRunMode", function()
	return false
end)
roblox.implementMethod("RunService", "BindToRenderStep", function(rs, name, prio, fn)
	bag(rs).bound = bag(rs).bound or {}
	bag(rs).bound[name] = fn
end)
roblox.implementMethod("RunService", "UnbindFromRenderStep", function(rs, name)
	if bag(rs).bound then
		bag(rs).bound[name] = nil
	end
end)

-- Tweens complete instantly
roblox.implementMethod("TweenService", "Create", function(ts, inst, info, goals)
	local tw = { Instance = inst, TweenInfo = info, PlaybackState = roblox.Enum.PlaybackState.Begin, Completed = Signal.new("Tween.Completed") }
	function tw:Play()
		for k, v in goals do
			(inst :: any)[k] = v
		end
		self.PlaybackState = roblox.Enum.PlaybackState.Completed
		task.defer(function()
			self.Completed:Fire(roblox.Enum.PlaybackState.Completed)
		end)
	end
	function tw:Cancel()
		self.PlaybackState = roblox.Enum.PlaybackState.Cancelled
	end
	function tw:Pause() end
	function tw:Destroy() end
	return tw
end)
roblox.implementMethod("TweenService", "GetValue", function(ts, alpha)
	return alpha
end)

roblox.implementMethod("HttpService", "JSONEncode", function(_, v)
	return serde.encode("json", v)
end)
roblox.implementMethod("HttpService", "JSONDecode", function(_, s)
	return serde.decode("json", s)
end)
local guidCounter = 0
roblox.implementMethod("HttpService", "GenerateGUID", function(_, braces)
	guidCounter += 1
	local g = string.format("%08x-0000-4000-8000-%012x", guidCounter, guidCounter * 7919)
	return if braces == false then g else "{" .. g .. "}"
end)

roblox.implementMethod("CollectionService", "GetTagged", function(_, tag)
	local out = {}
	for _, d in Engine.game:GetDescendants() do
		if d:HasTag(tag) then
			table.insert(out, d)
		end
	end
	return out
end)
roblox.implementMethod("CollectionService", "AddTag", function(_, inst, tag)
	inst:AddTag(tag)
end)
roblox.implementMethod("CollectionService", "RemoveTag", function(_, inst, tag)
	inst:RemoveTag(tag)
end)
roblox.implementMethod("CollectionService", "HasTag", function(_, inst, tag)
	return inst:HasTag(tag)
end)
roblox.implementMethod("CollectionService", "GetInstanceAddedSignal", function(cs, tag)
	local b = bag(cs)
	b.added = b.added or {}
	b.added[tag] = b.added[tag] or Signal.new("TagAdded:" .. tag)
	return b.added[tag]
end)
roblox.implementMethod("CollectionService", "GetInstanceRemovedSignal", function(cs, tag)
	local b = bag(cs)
	b.removed = b.removed or {}
	b.removed[tag] = b.removed[tag] or Signal.new("TagRemoved:" .. tag)
	return b.removed[tag]
end)

-- DataStores (in memory)
local stores = {}
Engine.stores = stores
local function makeStore(name)
	local data = {}
	local s = { _data = data, Name = name }
	function s:GetAsync(key)
		if Engine.dataStoreFails then
			error("DataStore request failed (mock)")
		end
		local v = data[key]
		return if v ~= nil then serde.decode("json", v) else nil
	end
	function s:SetAsync(key, value)
		if Engine.dataStoreFails then
			error("DataStore request failed (mock)")
		end
		data[key] = serde.encode("json", value)
	end
	function s:UpdateAsync(key, fn)
		if Engine.dataStoreFails then
			error("DataStore request failed (mock)")
		end
		local old = data[key] and serde.decode("json", data[key]) or nil
		local new = fn(old, nil)
		if new ~= nil then
			data[key] = serde.encode("json", new)
		end
		return new
	end
	function s:RemoveAsync(key)
		data[key] = nil
	end
	function s:IncrementAsync(key, delta)
		local v = (data[key] and serde.decode("json", data[key]) or 0) + (delta or 1)
		data[key] = serde.encode("json", v)
		return v
	end
	function s:GetSortedAsync()
		return {
			GetCurrentPage = function()
				return {}
			end,
			IsFinished = true,
		}
	end
	return s
end
roblox.implementMethod("DataStoreService", "GetDataStore", function(_, name, scope)
	local key = name .. "/" .. tostring(scope)
	stores[key] = stores[key] or makeStore(key)
	return stores[key]
end)
roblox.implementMethod("DataStoreService", "GetOrderedDataStore", function(_, name)
	local key = "ordered/" .. name
	stores[key] = stores[key] or makeStore(key)
	return stores[key]
end)
roblox.implementMethod("DataStoreService", "GetRequestBudgetForRequestType", function()
	return 100
end)

roblox.implementMethod("TextService", "FilterStringAsync", function(_, text)
	return {
		GetNonChatStringForBroadcastAsync = function()
			return text
		end,
		GetNonChatStringForUserAsync = function()
			return text
		end,
		GetChatForUserAsync = function()
			return text
		end,
	}
end)
roblox.implementMethod("TextService", "GetTextSize", function(_, text, size)
	return roblox.Vector2.new(#text * size * 0.5, size)
end)

roblox.implementMethod("MarketplaceService", "UserOwnsGamePassAsync", function()
	return false
end)
roblox.implementMethod("MarketplaceService", "PromptGamePassPurchase", function() end)
roblox.implementMethod("MarketplaceService", "PromptProductPurchase", function() end)
roblox.implementMethod("MarketplaceService", "GetProductInfo", function()
	return { Name = "Mock", PriceInRobux = 0 }
end)
roblox.implementMethod("BadgeService", "AwardBadge", function() end)
roblox.implementMethod("BadgeService", "UserHasBadgeAsync", function()
	return false
end)
Engine.played = {} -- SoundIds passed to SoundService:PlayLocalSound, in order
roblox.implementMethod("SoundService", "PlayLocalSound", function(_, s)
	table.insert(Engine.played, s.SoundId)
end)
roblox.implementMethod("SoundService", "SetListener", function() end)
roblox.implementMethod("Debris", "AddItem", function(_, inst, t)
	task.delay(t or 10, function()
		pcall(function()
			inst:Destroy()
		end)
	end)
end)
roblox.implementMethod("PhysicsService", "RegisterCollisionGroup", function() end)
roblox.implementMethod("PhysicsService", "CollisionGroupSetCollidable", function() end)
roblox.implementMethod("PhysicsService", "IsCollisionGroupRegistered", function()
	return true
end)
roblox.implementMethod("LocalizationService", "GetCountryRegionForPlayerAsync", function()
	return "TR"
end)
valueProp("LocalizationService", "RobloxLocaleId", "tr-tr")
valueProp("LocalizationService", "SystemLocaleId", "tr-tr")
roblox.implementMethod("StarterGui", "SetCoreGuiEnabled", function() end)
roblox.implementMethod("StarterGui", "GetCoreGuiEnabled", function()
	return true
end)
roblox.implementMethod("StarterGui", "SetCore", function() end)
roblox.implementMethod("GuiService", "GetGuiInset", function()
	return roblox.Vector2.new(0, 58), roblox.Vector2.new(0, 0)
end)
valueProp("GuiService", "TopbarInset", roblox.Rect.new(0, 0, 1280, 58))
roblox.implementMethod("ContextActionService", "BindAction", function(cas, name, fn, touch, ...)
	bag(cas).actions = bag(cas).actions or {}
	bag(cas).actions[name] = fn
end)
roblox.implementMethod("ContextActionService", "BindActionAtPriority", function(cas, name, fn, touch, prio, ...)
	bag(cas).actions = bag(cas).actions or {}
	bag(cas).actions[name] = fn
end)
roblox.implementMethod("ContextActionService", "UnbindAction", function(cas, name)
	if bag(cas).actions then
		bag(cas).actions[name] = nil
	end
end)
roblox.implementMethod("ContextActionService", "SetTitle", function() end)
roblox.implementMethod("ContextActionService", "SetPosition", function() end)
roblox.implementMethod("UserInputService", "GetMouseLocation", function()
	return roblox.Vector2.new(640, 360)
end)
roblox.implementMethod("UserInputService", "IsKeyDown", function()
	return false
end)
roblox.implementMethod("UserInputService", "IsMouseButtonPressed", function()
	return false
end)
roblox.implementMethod("UserInputService", "GetMouseDelta", function()
	return roblox.Vector2.new(0, 0)
end)
roblox.implementMethod("UserInputService", "GetLastInputType", function()
	return roblox.Enum.UserInputType.MouseButton1
end)
roblox.implementMethod("UserInputService", "GetFocusedTextBox", function()
	return nil
end)
valueProp("UserInputService", "TouchEnabled", false)
valueProp("UserInputService", "KeyboardEnabled", true)
valueProp("UserInputService", "MouseEnabled", true)
valueProp("UserInputService", "GamepadEnabled", false)
valueProp("UserInputService", "MouseBehavior", roblox.Enum.MouseBehavior.Default)
valueProp("UserInputService", "MouseIconEnabled", true)
roblox.implementMethod("TextChatService", "DisplayBubble", function() end)
roblox.implementMethod("Chat", "Chat", function() end)
roblox.implementMethod("TeleportService", "TeleportAsync", function() end)
roblox.implementMethod("SocialService", "PromptGameInvite", function() end)
roblox.implementMethod("PathfindingService", "CreatePath", function()
	local path = { Status = roblox.Enum.PathStatus.Success, Blocked = Signal.new("Blocked") }
	local waypoints = {}
	function path:ComputeAsync(a, b)
		waypoints = { { Position = a, Action = roblox.Enum.PathWaypointAction.Walk }, { Position = b, Action = roblox.Enum.PathWaypointAction.Walk } }
	end
	function path:GetWaypoints()
		return waypoints
	end
	function path:Destroy() end
	return path
end)

-- Workspace
local serverStart = os.clock()
roblox.implementMethod("Workspace", "GetServerTimeNow", function()
	return 1700000000 + (os.clock() - serverStart) + (Engine.timeOffset or 0)
end)
roblox.implementMethod("Workspace", "Raycast", function()
	return nil
end)
roblox.implementMethod("Workspace", "Blockcast", function()
	return nil
end)
roblox.implementMethod("Workspace", "Spherecast", function()
	return nil
end)
roblox.implementMethod("Workspace", "GetPartBoundsInRadius", function()
	return {}
end)
roblox.implementMethod("Workspace", "GetPartBoundsInBox", function()
	return {}
end)
roblox.implementMethod("Workspace", "GetPartsInPart", function()
	return {}
end)
roblox.implementMethod("Workspace", "BulkMoveTo", function(_, parts, cframes)
	for i, p in parts do
		p.CFrame = cframes[i]
	end
end)
roblox.implementMethod("Workspace", "GetRealPhysicsFPS", function()
	return 60
end)
valueProp("Workspace", "CurrentCamera", function(ws)
	local b = bag(ws)
	if not b.camera then
		local cam = Instance.new("Camera")
		cam.Name = "Camera"
		cam.Parent = ws
		b.camera = cam
	end
	return b.camera
end)
valueProp("Workspace", "DistributedGameTime", 0)

-- Terrain (records calls)
Engine.terrainCalls = 0
for _, name in { "FillBlock", "FillBall", "FillCylinder", "FillWedge", "FillRegion", "Clear", "ReplaceMaterial", "SetMaterialColor" } do
	roblox.implementMethod("Terrain", name, function()
		Engine.terrainCalls += 1
	end)
end
roblox.implementMethod("Terrain", "GetMaterialColor", function()
	return roblox.Color3.new(0.5, 0.5, 0.5)
end)

-- Players
roblox.implementMethod("Players", "GetPlayers", function(players)
	local out = {}
	for _, c in players:GetChildren() do
		if c:IsA("Player") then
			table.insert(out, c)
		end
	end
	return out
end)
roblox.implementMethod("Players", "GetPlayerByUserId", function(players, id)
	for _, c in players:GetChildren() do
		if c:IsA("Player") and c.UserId == id then
			return c
		end
	end
	return nil
end)
roblox.implementMethod("Players", "GetPlayerFromCharacter", function(players, char)
	for _, c in players:GetChildren() do
		if c:IsA("Player") and c.Character == char then
			return c
		end
	end
	return nil
end)
roblox.implementMethod("Players", "GetNameFromUserIdAsync", function()
	return "Tester"
end)
roblox.implementMethod("Players", "GetUserThumbnailAsync", function()
	return "rbxasset://textures/ui/GuiImagePlaceholder.png", true
end)
roblox.implementMethod("Players", "GetHumanoidDescriptionFromUserId", function()
	return Instance.new("HumanoidDescription")
end)
valueProp("Players", "LocalPlayer", function()
	return Engine.localPlayer
end)

-- A blocky R15-ish rig so NPC code has the parts it expects.
local R15_PARTS = {
	{ "HumanoidRootPart", 2, 2, 1, 0, 0 },
	{ "LowerTorso", 2, 0.4, 1, 0, -0.8 },
	{ "UpperTorso", 2, 1.6, 1, 0, 0.2 },
	{ "Head", 1.2, 1.2, 1.2, 0, 1.6 },
	{ "LeftUpperArm", 1, 1.2, 1, -1.5, 0.4 },
	{ "LeftLowerArm", 1, 1.1, 1, -1.5, -0.6 },
	{ "LeftHand", 1, 0.3, 1, -1.5, -1.2 },
	{ "RightUpperArm", 1, 1.2, 1, 1.5, 0.4 },
	{ "RightLowerArm", 1, 1.1, 1, 1.5, -0.6 },
	{ "RightHand", 1, 0.3, 1, 1.5, -1.2 },
	{ "LeftUpperLeg", 1, 1.2, 1, -0.5, -1.6 },
	{ "LeftLowerLeg", 1, 1.2, 1, -0.5, -2.6 },
	{ "LeftFoot", 1, 0.3, 1, -0.5, -3.2 },
	{ "RightUpperLeg", 1, 1.2, 1, 0.5, -1.6 },
	{ "RightLowerLeg", 1, 1.2, 1, 0.5, -2.6 },
	{ "RightFoot", 1, 0.3, 1, 0.5, -3.2 },
}
function Engine.makeRig(name: string?)
	local model = Instance.new("Model")
	model.Name = name or "Rig"
	local root
	for _, def in R15_PARTS do
		local p = Instance.new(if def[1] == "HumanoidRootPart" then "Part" else "MeshPart")
		p.Name = def[1]
		p.Size = roblox.Vector3.new(def[2], def[3], def[4])
		p.CFrame = roblox.CFrame.new(def[5], def[6] + 4, 0)
		if def[1] == "HumanoidRootPart" then
			p.Transparency = 1
			root = p
		end
		p.Parent = model
	end
	model.PrimaryPart = root
	for _, def in R15_PARTS do
		if def[1] ~= "HumanoidRootPart" then
			local m = Instance.new("Motor6D")
			m.Name = def[1]
			m.Part0 = root
			m.Part1 = model:FindFirstChild(def[1])
			m.Parent = m.Part1
		end
	end
	local face = Instance.new("Decal")
	face.Name = "face"
	face.Parent = model:FindFirstChild("Head")
	local hum = Instance.new("Humanoid")
	local animator = Instance.new("Animator")
	animator.Parent = hum
	hum.Parent = model
	local bc = Instance.new("BodyColors")
	bc.Parent = model
	return model
end
roblox.implementMethod("Players", "CreateHumanoidModelFromDescription", function(_, desc, rigType)
	return Engine.makeRig("NPC")
end)
roblox.implementMethod("Players", "CreateHumanoidModelFromUserId", function()
	return Engine.makeRig("NPC")
end)

----------------------------------------------------------------------------------------------------
-- Place loading and the script environment
----------------------------------------------------------------------------------------------------
function Engine.load(placePath: string)
	local game = roblox.deserializePlace(fs.readFile(placePath))
	Engine.game = game
	Engine.workspace = game:GetService("Workspace")
	-- services that must exist as instances
	for _, name in { "Players", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "Lighting", "SoundService", "StarterPlayer", "StarterGui", "Teams", "Chat", "TextChatService" } do
		game:GetService(name)
	end
	if not Engine.workspace:FindFirstChildOfClass("Terrain") then
		local t = Instance.new("Terrain")
		t.Name = "Terrain"
		t.Parent = Engine.workspace
	end
	-- server and client get their own module instances (like two machines would)
	Engine.cache = {}
	Engine.clientCache = {}
	return game
end

local function warnFn(...)
	local parts = {}
	for i = 1, select("#", ...) do
		table.insert(parts, tostring((select(i, ...))))
	end
	local msg = table.concat(parts, " ")
	table.insert(Engine.warnings, msg)
	if Engine.verbose then
		print("[warn] " .. msg)
	end
end
Engine.warnings = {}

-- Game code's task library: errors in spawned/deferred/delayed functions are recorded in
-- Mock.errors (Roblox would print them to the output) so specs can assert there were none.
local function guarded(f)
	if type(f) ~= "function" then
		return f
	end
	return function(...)
		local ok, err = xpcall(f, debug.traceback, ...)
		if not ok then
			Mock.errors = Mock.errors or {}
			table.insert(Mock.errors, tostring(err))
			print("[task error] " .. tostring(err))
		end
	end
end
local gameTask = {
	spawn = function(f, ...)
		return task.spawn(guarded(f), ...)
	end,
	defer = function(f, ...)
		return task.defer(guarded(f), ...)
	end,
	delay = function(t, f, ...)
		return task.delay(t, guarded(f), ...)
	end,
	wait = task.wait,
	cancel = task.cancel,
	synchronize = function() end,
	desynchronize = function() end,
}

local function makeEnv(scriptInst, realm: string)
	local env = {
		script = scriptInst,
		game = Engine.game,
		workspace = Engine.workspace,
		Instance = roblox.Instance,
		Vector2 = roblox.Vector2,
		Vector3 = roblox.Vector3,
		Vector2int16 = roblox.Vector2int16,
		Vector3int16 = roblox.Vector3int16,
		CFrame = roblox.CFrame,
		Color3 = roblox.Color3,
		BrickColor = roblox.BrickColor,
		UDim = roblox.UDim,
		UDim2 = roblox.UDim2,
		Rect = roblox.Rect,
		Ray = roblox.Ray,
		Region3 = roblox.Region3,
		NumberRange = roblox.NumberRange,
		NumberSequence = roblox.NumberSequence,
		NumberSequenceKeypoint = roblox.NumberSequenceKeypoint,
		ColorSequence = roblox.ColorSequence,
		ColorSequenceKeypoint = roblox.ColorSequenceKeypoint,
		PhysicalProperties = roblox.PhysicalProperties,
		Font = roblox.Font,
		Faces = roblox.Faces,
		Axes = roblox.Axes,
		Enum = roblox.Enum,
		Random = Mock.Random,
		TweenInfo = Mock.TweenInfo,
		RaycastParams = Mock.RaycastParams,
		OverlapParams = Mock.OverlapParams,
		DateTime = Mock.DateTime,
		task = gameTask,
		tick = function()
			return os.time() + (os.clock() % 1)
		end,
		time = function()
			return os.clock()
		end,
		wait = task.wait,
		delay = gameTask.delay,
		spawn = gameTask.spawn,
		warn = warnFn,
		print = function(...)
			if Engine.verbose then
				print(...)
			end
		end,
		typeof = typeof,
		shared = {},
	}
	env.require = function(target)
		return Engine.require(target, realm)
	end
	return env
end

-- realm: "server" (default) or "client"; each realm has its own module cache, and RunService
-- reports the realm while a module's top level runs (Net decides its side there).
function Engine.require(ms, realm: string?)
	if typeof(ms) ~= "Instance" or not ms:IsA("ModuleScript") then
		error("require() expects a ModuleScript, got " .. typeof(ms))
	end
	local r = realm or "server"
	local cache = if r == "client" then Engine.clientCache else Engine.cache
	local cached = cache[ms]
	if cached then
		if cached.loading then
			error("cyclic require: " .. ms:GetFullName())
		end
		return cached.value
	end
	local entry = { loading = true }
	cache[ms] = entry
	local fn = luau.load(ms.Source, { debugName = ms:GetFullName(), environment = makeEnv(ms, r), injectGlobals = true })
	local prev = Engine.context
	Engine.context = r
	local ok, value = pcall(fn)
	Engine.context = prev
	if not ok then
		cache[ms] = nil
		error(string.format("error loading %s: %s", ms:GetFullName(), tostring(value)), 0)
	end
	entry.loading = false
	entry.value = value
	return value
end

-- Runs a Script / LocalScript's source (LocalScripts in the client realm).
function Engine.runScript(s)
	local realm = if s:IsA("LocalScript") then "client" else "server"
	local fn = luau.load(s.Source, { debugName = s:GetFullName(), environment = makeEnv(s, realm), injectGlobals = true })
	local ok, err = pcall(fn)
	if not ok then
		error(string.format("error running %s: %s", s:GetFullName(), tostring(err)), 0)
	end
end

-- Finds an instance by a dotted path from game: "ReplicatedStorage.Shared.Util.Builder"
function Engine.find(path: string)
	local cur = Engine.game
	for name in string.gmatch(path, "[^%.]+") do
		local nxt = cur:FindFirstChild(name)
		if not nxt then
			error("path not found: " .. path .. " (missing " .. name .. ")")
		end
		cur = nxt
	end
	return cur
end

function Engine.mod(path: string)
	return Engine.require(Engine.find(path))
end

-- Adds a fake player to Players.
local nextUserId = 1000
function Engine.addPlayer(name: string)
	nextUserId += 1
	local p = Instance.new("Player")
	p.Name = name
	p.DisplayName = name
	p.UserId = nextUserId
	local gui = Instance.new("PlayerGui")
	gui.Parent = p
	local scripts = Instance.new("PlayerScripts")
	scripts.Parent = p
	local backpack = Instance.new("Backpack")
	backpack.Parent = p
	p.Parent = Engine.game:GetService("Players")
	Engine.game:GetService("Players").PlayerAdded:Fire(p)
	return p
end

function Engine.spawnCharacter(player)
	local char = Engine.makeRig(player.Name)
	char.Parent = Engine.workspace
	player.Character = char
	player.CharacterAdded:Fire(char)
	return char
end

-- Fires RunService.Heartbeat n times with dt.
function Engine.step(n: number?, dt: number?)
	local rs = Engine.game:GetService("RunService")
	for _ = 1, n or 1 do
		rs.Heartbeat:Fire(dt or 1 / 30)
		rs.Stepped:Fire(0, dt or 1 / 30)
		rs.PreSimulation:Fire(dt or 1 / 30)
		if Engine.context == "client" then
			rs.RenderStepped:Fire(dt or 1 / 30)
			rs.PreRender:Fire(dt or 1 / 30)
			local bound = bag(rs).bound
			if bound then
				for _, fn in bound do
					fn(dt or 1 / 30)
				end
			end
		end
	end
end

return Engine
