#include "box3d/box3d.h"

#include "human.h"

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#define B3W_MAX_WORLDS 32
#define B3W_MAX_BODIES 16384
#define B3W_MAX_JOINTS 4096

typedef struct B3WWorldSlot
{
	bool used;
	b3WorldId id;
} B3WWorldSlot;

typedef struct B3WBodySlot
{
	bool used;
	int worldHandle;
	b3BodyId id;
} B3WBodySlot;

typedef struct B3WJointSlot
{
	bool used;
	int worldHandle;
	b3JointId id;
} B3WJointSlot;

#define B3W_MAX_HUMANS 64

static B3WWorldSlot s_worlds[B3W_MAX_WORLDS];
static B3WBodySlot s_bodies[B3W_MAX_BODIES];
static B3WJointSlot s_joints[B3W_MAX_JOINTS];
static Human s_humans[B3W_MAX_HUMANS];
static int s_humanWorlds[B3W_MAX_HUMANS];
static int s_nextBodyProbe = 0;

static int b3w_alloc_world(b3WorldId id)
{
	for (int i = 0; i < B3W_MAX_WORLDS; ++i)
	{
		if (!s_worlds[i].used)
		{
			s_worlds[i].used = true;
			s_worlds[i].id = id;
			return i + 1;
		}
	}

	return 0;
}

static int b3w_alloc_body(int worldHandle, b3BodyId id)
{
	// Rotating probe keeps sequential allocation O(1) instead of scanning
	// the low slots every time once thousands of bodies exist.
	for (int n = 0; n < B3W_MAX_BODIES; ++n)
	{
		int i = (s_nextBodyProbe + n) % B3W_MAX_BODIES;
		if (!s_bodies[i].used)
		{
			s_bodies[i].used = true;
			s_bodies[i].worldHandle = worldHandle;
			s_bodies[i].id = id;
			s_nextBodyProbe = (i + 1) % B3W_MAX_BODIES;
			// The handle rides in userData so contact events can map a
			// b3BodyId back to its bridge handle without a slot scan.
			b3Body_SetUserData(id, (void*)(intptr_t)(i + 1));
			return i + 1;
		}
	}

	return 0;
}

static int b3w_alloc_joint(int worldHandle, b3JointId id)
{
	for (int i = 0; i < B3W_MAX_JOINTS; ++i)
	{
		if (!s_joints[i].used)
		{
			s_joints[i].used = true;
			s_joints[i].worldHandle = worldHandle;
			s_joints[i].id = id;
			return i + 1;
		}
	}

	return 0;
}

static bool b3w_get_world(int handle, b3WorldId* out)
{
	if (handle <= 0 || handle > B3W_MAX_WORLDS || !s_worlds[handle - 1].used)
	{
		return false;
	}

	*out = s_worlds[handle - 1].id;
	return b3World_IsValid(*out);
}

static bool b3w_get_body(int handle, b3BodyId* out)
{
	if (handle <= 0 || handle > B3W_MAX_BODIES || !s_bodies[handle - 1].used)
	{
		return false;
	}

	*out = s_bodies[handle - 1].id;
	return b3Body_IsValid(*out);
}

int b3w_create_world(float gx, float gy, float gz)
{
	b3WorldDef def = b3DefaultWorldDef();
	def.gravity = (b3Vec3){gx, gy, gz};
	def.workerCount = 1;

	b3WorldId worldId = b3CreateWorld(&def);
	return b3w_alloc_world(worldId);
}

void b3w_destroy_world(int worldHandle)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return;
	}

	for (int i = 0; i < B3W_MAX_BODIES; ++i)
	{
		if (s_bodies[i].used && s_bodies[i].worldHandle == worldHandle)
		{
			s_bodies[i].used = false;
		}
	}

	for (int i = 0; i < B3W_MAX_JOINTS; ++i)
	{
		if (s_joints[i].used && s_joints[i].worldHandle == worldHandle)
		{
			s_joints[i].used = false;
		}
	}

	for (int i = 0; i < B3W_MAX_HUMANS; ++i)
	{
		if (s_humans[i].isSpawned && s_humanWorlds[i] == worldHandle)
		{
			memset(&s_humans[i], 0, sizeof(Human));
			s_humanWorlds[i] = 0;
		}
	}

	b3DestroyWorld(worldId);
	s_worlds[worldHandle - 1].used = false;
	s_nextBodyProbe = 0;
}

void b3w_step_world(int worldHandle, float timeStep, int subStepCount)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return;
	}

	b3World_Step(worldId, timeStep, subStepCount);
}

int b3w_create_box(
	int worldHandle,
	int bodyType,
	float x,
	float y,
	float z,
	float hx,
	float hy,
	float hz,
	float density,
	float friction,
	float restitution,
	float rollingResistance,
	int isBullet)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return 0;
	}

	b3BodyDef bodyDef = b3DefaultBodyDef();
	bodyDef.type = (b3BodyType)bodyType;
	bodyDef.position = (b3Pos){x, y, z};
	bodyDef.isBullet = isBullet != 0;

	b3BodyId bodyId = b3CreateBody(worldId, &bodyDef);

	b3ShapeDef shapeDef = b3DefaultShapeDef();
	shapeDef.density = density;
	shapeDef.baseMaterial.friction = friction;
	shapeDef.baseMaterial.restitution = restitution;
	shapeDef.baseMaterial.rollingResistance = rollingResistance;

	b3BoxHull box = b3MakeBoxHull(hx, hy, hz);
	b3CreateHullShape(bodyId, &shapeDef, &box.base);

	return b3w_alloc_body(worldHandle, bodyId);
}

int b3w_create_sphere(
	int worldHandle,
	int bodyType,
	float x,
	float y,
	float z,
	float radius,
	float density,
	float friction,
	float restitution,
	float rollingResistance,
	int isBullet)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return 0;
	}

	b3BodyDef bodyDef = b3DefaultBodyDef();
	bodyDef.type = (b3BodyType)bodyType;
	bodyDef.position = (b3Pos){x, y, z};
	bodyDef.isBullet = isBullet != 0;
	bodyDef.allowFastRotation = true;

	b3BodyId bodyId = b3CreateBody(worldId, &bodyDef);

	b3ShapeDef shapeDef = b3DefaultShapeDef();
	shapeDef.density = density;
	shapeDef.baseMaterial.friction = friction;
	shapeDef.baseMaterial.restitution = restitution;
	shapeDef.baseMaterial.rollingResistance = rollingResistance;

	b3Sphere sphere = {{0.0f, 0.0f, 0.0f}, radius};
	b3CreateSphereShape(bodyId, &shapeDef, &sphere);

	return b3w_alloc_body(worldHandle, bodyId);
}

void b3w_destroy_body(int bodyHandle)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3DestroyBody(bodyId);
	s_bodies[bodyHandle - 1].used = false;
}

void b3w_set_body_transform(
	int bodyHandle,
	float x,
	float y,
	float z,
	float qx,
	float qy,
	float qz,
	float qw)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_SetTransform(bodyId, (b3Pos){x, y, z}, (b3Quat){{qx, qy, qz}, qw});
}

void b3w_set_body_velocity(int bodyHandle, float vx, float vy, float vz, float wx, float wy, float wz)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_SetLinearVelocity(bodyId, (b3Vec3){vx, vy, vz});
	b3Body_SetAngularVelocity(bodyId, (b3Vec3){wx, wy, wz});
}

void b3w_apply_impulse(int bodyHandle, float ix, float iy, float iz)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_ApplyLinearImpulseToCenter(bodyId, (b3Vec3){ix, iy, iz}, true);
}

void b3w_apply_angular_impulse(int bodyHandle, float ix, float iy, float iz)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_ApplyAngularImpulse(bodyId, (b3Vec3){ix, iy, iz}, true);
}

void b3w_explode(int worldHandle, float x, float y, float z, float radius, float falloff, float impulsePerArea)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return;
	}

	b3ExplosionDef def = b3DefaultExplosionDef();
	def.position = (b3Pos){x, y, z};
	def.radius = radius;
	def.falloff = falloff;
	def.impulsePerArea = impulsePerArea;
	b3World_Explode(worldId, &def);
}

void b3w_get_body_transform(int bodyHandle, float* out)
{
	if (out == 0)
	{
		return;
	}

	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		out[0] = 0.0f;
		out[1] = 0.0f;
		out[2] = 0.0f;
		out[3] = 0.0f;
		out[4] = 0.0f;
		out[5] = 0.0f;
		out[6] = 1.0f;
		return;
	}

	b3WorldTransform transform = b3Body_GetTransform(bodyId);
	out[0] = (float)transform.p.x;
	out[1] = (float)transform.p.y;
	out[2] = (float)transform.p.z;
	out[3] = transform.q.v.x;
	out[4] = transform.q.v.y;
	out[5] = transform.q.v.z;
	out[6] = transform.q.s;
}

float b3w_get_body_transform_component(int bodyHandle, int component)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return component == 6 ? 1.0f : 0.0f;
	}

	b3WorldTransform transform = b3Body_GetTransform(bodyId);
	switch (component)
	{
		case 0:
			return (float)transform.p.x;
		case 1:
			return (float)transform.p.y;
		case 2:
			return (float)transform.p.z;
		case 3:
			return transform.q.v.x;
		case 4:
			return transform.q.v.y;
		case 5:
			return transform.q.v.z;
		case 6:
			return transform.q.s;
		default:
			return 0.0f;
	}
}

float b3w_get_body_speed(int bodyHandle)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return 0.0f;
	}

	b3Vec3 v = b3Body_GetLinearVelocity(bodyId);
	return sqrtf(v.x * v.x + v.y * v.y + v.z * v.z);
}

int b3w_get_world_count(void)
{
	return b3GetWorldCount();
}

int b3w_create_capsule(
	int worldHandle,
	int bodyType,
	float x,
	float y,
	float z,
	float halfHeight,
	float radius,
	float density,
	float friction,
	float restitution,
	float rollingResistance,
	int isBullet)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return 0;
	}

	b3BodyDef bodyDef = b3DefaultBodyDef();
	bodyDef.type = (b3BodyType)bodyType;
	bodyDef.position = (b3Pos){x, y, z};
	bodyDef.isBullet = isBullet != 0;

	b3BodyId bodyId = b3CreateBody(worldId, &bodyDef);

	b3ShapeDef shapeDef = b3DefaultShapeDef();
	shapeDef.density = density;
	shapeDef.baseMaterial.friction = friction;
	shapeDef.baseMaterial.restitution = restitution;
	shapeDef.baseMaterial.rollingResistance = rollingResistance;

	b3Capsule capsule = {{0.0f, -halfHeight, 0.0f}, {0.0f, halfHeight, 0.0f}, radius};
	b3CreateCapsuleShape(bodyId, &shapeDef, &capsule);

	return b3w_alloc_body(worldHandle, bodyId);
}

// Fills out with stride 8 per body: px py pz qx qy qz qw awakeFlag.
// One WASM call per frame instead of seven exported-function calls per body.
void b3w_get_body_transforms(const int* handles, int count, float* out)
{
	if (handles == 0 || out == 0)
	{
		return;
	}

	for (int i = 0; i < count; ++i)
	{
		float* dst = out + i * 8;
		b3BodyId bodyId;
		if (!b3w_get_body(handles[i], &bodyId))
		{
			dst[0] = 0.0f;
			dst[1] = 0.0f;
			dst[2] = 0.0f;
			dst[3] = 0.0f;
			dst[4] = 0.0f;
			dst[5] = 0.0f;
			dst[6] = 1.0f;
			dst[7] = 0.0f;
			continue;
		}

		b3WorldTransform transform = b3Body_GetTransform(bodyId);
		dst[0] = (float)transform.p.x;
		dst[1] = (float)transform.p.y;
		dst[2] = (float)transform.p.z;
		dst[3] = transform.q.v.x;
		dst[4] = transform.q.v.y;
		dst[5] = transform.q.v.z;
		dst[6] = transform.q.s;
		dst[7] = b3Body_IsAwake(bodyId) ? 1.0f : 0.0f;
	}
}

void b3w_get_body_velocity(int bodyHandle, float* out)
{
	if (out == 0)
	{
		return;
	}

	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		for (int i = 0; i < 6; ++i)
		{
			out[i] = 0.0f;
		}
		return;
	}

	b3Vec3 v = b3Body_GetLinearVelocity(bodyId);
	b3Vec3 w = b3Body_GetAngularVelocity(bodyId);
	out[0] = v.x;
	out[1] = v.y;
	out[2] = v.z;
	out[3] = w.x;
	out[4] = w.y;
	out[5] = w.z;
}

void b3w_apply_force(int bodyHandle, float fx, float fy, float fz)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_ApplyForceToCenter(bodyId, (b3Vec3){fx, fy, fz}, true);
}

void b3w_apply_impulse_at_point(int bodyHandle, float ix, float iy, float iz, float px, float py, float pz)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_ApplyLinearImpulse(bodyId, (b3Vec3){ix, iy, iz}, (b3Pos){px, py, pz}, true);
}

void b3w_set_body_awake(int bodyHandle, int awake)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_SetAwake(bodyId, awake != 0);
}

int b3w_body_is_awake(int bodyHandle)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return 0;
	}

	return b3Body_IsAwake(bodyId) ? 1 : 0;
}

float b3w_get_body_mass(int bodyHandle)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return 0.0f;
	}

	return b3Body_GetMass(bodyId);
}

static b3Transform b3w_local_frame(b3BodyId bodyId, float ax, float ay, float az)
{
	b3Transform frame;
	frame.p = b3Body_GetLocalPoint(bodyId, (b3Pos){ax, ay, az});
	frame.q = (b3Quat){{0.0f, 0.0f, 0.0f}, 1.0f};
	return frame;
}

// Ball-and-socket joint at a shared world-space anchor.
// hertz <= 0 keeps the joint rigid (no rotational spring).
int b3w_create_spherical_joint(
	int worldHandle,
	int bodyHandleA,
	int bodyHandleB,
	float ax,
	float ay,
	float az,
	float hertz,
	float dampingRatio)
{
	b3WorldId worldId;
	b3BodyId bodyA;
	b3BodyId bodyB;
	if (!b3w_get_world(worldHandle, &worldId) || !b3w_get_body(bodyHandleA, &bodyA) || !b3w_get_body(bodyHandleB, &bodyB))
	{
		return 0;
	}

	b3SphericalJointDef def = b3DefaultSphericalJointDef();
	def.base.bodyIdA = bodyA;
	def.base.bodyIdB = bodyB;
	def.base.localFrameA = b3w_local_frame(bodyA, ax, ay, az);
	def.base.localFrameB = b3w_local_frame(bodyB, ax, ay, az);
	if (hertz > 0.0f)
	{
		def.enableSpring = true;
		def.hertz = hertz;
		def.dampingRatio = dampingRatio;
	}

	b3JointId jointId = b3CreateSphericalJoint(worldId, &def);
	return b3w_alloc_joint(worldHandle, jointId);
}

// Distance joint between world-space anchors on each body.
// length <= 0 uses the current anchor separation. hertz > 0 makes it springy.
int b3w_create_distance_joint(
	int worldHandle,
	int bodyHandleA,
	int bodyHandleB,
	float ax,
	float ay,
	float az,
	float bx,
	float by,
	float bz,
	float length,
	float hertz,
	float dampingRatio)
{
	b3WorldId worldId;
	b3BodyId bodyA;
	b3BodyId bodyB;
	if (!b3w_get_world(worldHandle, &worldId) || !b3w_get_body(bodyHandleA, &bodyA) || !b3w_get_body(bodyHandleB, &bodyB))
	{
		return 0;
	}

	b3DistanceJointDef def = b3DefaultDistanceJointDef();
	def.base.bodyIdA = bodyA;
	def.base.bodyIdB = bodyB;
	def.base.localFrameA = b3w_local_frame(bodyA, ax, ay, az);
	def.base.localFrameB = b3w_local_frame(bodyB, bx, by, bz);

	float dx = bx - ax;
	float dy = by - ay;
	float dz = bz - az;
	def.length = length > 0.0f ? length : sqrtf(dx * dx + dy * dy + dz * dz);
	if (hertz > 0.0f)
	{
		def.enableSpring = true;
		def.hertz = hertz;
		def.dampingRatio = dampingRatio;
	}

	b3JointId jointId = b3CreateDistanceJoint(worldId, &def);
	return b3w_alloc_joint(worldHandle, jointId);
}

void b3w_set_body_gravity_scale(int bodyHandle, float scale)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_SetGravityScale(bodyId, scale);
}

// Writes center1 (3), center2 (3), radius (1) of the body's first capsule
// shape. Returns 0 when the body has no capsule shape.
int b3w_get_body_capsule(int bodyHandle, float* out)
{
	b3BodyId bodyId;
	if (out == 0 || !b3w_get_body(bodyHandle, &bodyId))
	{
		return 0;
	}

	b3ShapeId shapeId;
	if (b3Body_GetShapes(bodyId, &shapeId, 1) < 1 || b3Shape_GetType(shapeId) != b3_capsuleShape)
	{
		return 0;
	}

	b3Capsule capsule = b3Shape_GetCapsule(shapeId);
	out[0] = capsule.center1.x;
	out[1] = capsule.center1.y;
	out[2] = capsule.center1.z;
	out[3] = capsule.center2.x;
	out[4] = capsule.center2.y;
	out[5] = capsule.center2.z;
	out[6] = capsule.radius;
	return 1;
}

// Spawns the official Box3D samples ragdoll (shared/human.c). Writes one
// body handle per bone into outBodyHandles (bone_count entries) and returns
// a human handle, or 0 on failure.
int b3w_spawn_human(
	int worldHandle,
	float x,
	float y,
	float z,
	float frictionTorque,
	float hertz,
	float dampingRatio,
	int* outBodyHandles)
{
	b3WorldId worldId;
	if (outBodyHandles == 0 || !b3w_get_world(worldHandle, &worldId))
	{
		return 0;
	}

	int slot = -1;
	for (int i = 0; i < B3W_MAX_HUMANS; ++i)
	{
		if (!s_humans[i].isSpawned)
		{
			slot = i;
			break;
		}
	}

	if (slot < 0)
	{
		return 0;
	}

	Human* human = &s_humans[slot];
	memset(human, 0, sizeof(Human));
	CreateHuman(human, worldId, (b3Pos){x, y, z}, frictionTorque, hertz, dampingRatio, slot + 1, 0, false);
	s_humanWorlds[slot] = worldHandle;

	for (int i = 0; i < bone_count; ++i)
	{
		outBodyHandles[i] = b3w_alloc_body(worldHandle, human->bones[i].bodyId);
	}

	return slot + 1;
}

int b3w_human_bone_count(void)
{
	return bone_count;
}

void b3w_human_set_velocity(int humanHandle, float vx, float vy, float vz)
{
	if (humanHandle <= 0 || humanHandle > B3W_MAX_HUMANS || !s_humans[humanHandle - 1].isSpawned)
	{
		return;
	}

	Human_SetVelocity(&s_humans[humanHandle - 1], (b3Vec3){vx, vy, vz});
}

void b3w_human_apply_random_impulse(int humanHandle, float magnitude)
{
	if (humanHandle <= 0 || humanHandle > B3W_MAX_HUMANS || !s_humans[humanHandle - 1].isSpawned)
	{
		return;
	}

	Human_ApplyRandomAngularImpulse(&s_humans[humanHandle - 1], magnitude);
}

void b3w_destroy_joint(int jointHandle)
{
	if (jointHandle <= 0 || jointHandle > B3W_MAX_JOINTS || !s_joints[jointHandle - 1].used)
	{
		return;
	}

	b3JointId jointId = s_joints[jointHandle - 1].id;
	if (b3Joint_IsValid(jointId))
	{
		b3DestroyJoint(jointId, true);
	}

	s_joints[jointHandle - 1].used = false;
}

void b3w_set_hit_event_threshold(int worldHandle, float value)
{
	b3WorldId worldId;
	if (!b3w_get_world(worldHandle, &worldId))
	{
		return;
	}

	b3World_SetHitEventThreshold(worldId, value);
}

void b3w_body_enable_hit_events(int bodyHandle, int enable)
{
	b3BodyId bodyId;
	if (!b3w_get_body(bodyHandle, &bodyId))
	{
		return;
	}

	b3Body_EnableHitEvents(bodyId, enable != 0);
}

// Writes up to maxEvents contact hit events as 9 floats each:
// bodyHandleA, bodyHandleB, px, py, pz, nx, ny, nz, approachSpeed.
// Returns the number of events written. Events describe the most recent
// completed step, so read them after stepping and before the next step.
int b3w_get_hit_events(int worldHandle, float* out, int maxEvents)
{
	b3WorldId worldId;
	if (out == 0 || maxEvents <= 0 || !b3w_get_world(worldHandle, &worldId))
	{
		return 0;
	}

	b3ContactEvents events = b3World_GetContactEvents(worldId);
	int count = events.hitCount < maxEvents ? events.hitCount : maxEvents;
	for (int i = 0; i < count; ++i)
	{
		const b3ContactHitEvent* hit = events.hitEvents + i;
		b3BodyId bodyA = b3Shape_GetBody(hit->shapeIdA);
		b3BodyId bodyB = b3Shape_GetBody(hit->shapeIdB);
		float* entry = out + i * 9;
		entry[0] = (float)(intptr_t)b3Body_GetUserData(bodyA);
		entry[1] = (float)(intptr_t)b3Body_GetUserData(bodyB);
		entry[2] = (float)hit->point.x;
		entry[3] = (float)hit->point.y;
		entry[4] = (float)hit->point.z;
		entry[5] = hit->normal.x;
		entry[6] = hit->normal.y;
		entry[7] = hit->normal.z;
		entry[8] = hit->approachSpeed;
	}

	return count;
}
