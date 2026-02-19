# Excavation and Transport System - Migration Guide

## Changes Summary

### 🎯 Key Improvements
1. **Separate tasks** - Excavation and Transport are now separate tasks for better tracking
2. **Editable carrier speed** - Each carrier can have custom speed (m/h)
3. **Dynamic transport calculation** - Transport time calculated based on actual distance and carrier speed
4. **Simplified UI** - Removed "Pile Up" radio buttons, distance=0 means pile up
5. **Auto-task creation** - Excavation tasks auto-created when adding excavators

---

## Database Changes

### Migration: `20260208_add_speed_to_setup_digging.sql`

```sql
ALTER TABLE public.setup_digging 
ADD COLUMN IF NOT EXISTS speed_m_per_hour INTEGER DEFAULT NULL;

-- Default speeds:
0.1t  → 3000 m/h
0.125t → 2750 m/h
0.15t → 2500 m/h
0.3t  → 1500 m/h
0.5t  → 1500 m/h
1t    → 4000 m/h
3t    → 6000 m/h
5t    → 7000 m/h
10t   → 8000 m/h
```

---

## New System Flow

### 1. Setup Phase (SetupDigging.tsx)

#### Adding Excavator:
```
User adds: "Small Digger" (3t)
↓
System automatically creates task in event_tasks:
  - Name: "Excavation soil with Small Digger (3t)"
  - estimated_hours: 0.02 h/ton
  - unit: "tons"
✅ Task template created
```

#### Adding Carrier:
```
User adds: "Medium Dumper" (5t)
User sets speed: 7000 m/h (or uses default)
↓
Saved to setup_digging:
  - name: "Medium Dumper"
  - size: 5
  - speed_m_per_hour: 7000
❌ NO task template created (transport is dynamic)
```

### 2. Project Creation (ProjectCreating.tsx)

#### With Transport (distance > 0):
```
Input:
  - Excavator: Small Digger (3t)
  - Carrier: Medium Dumper (5t, 7000 m/h)
  - Soil: 15 tons
  - Distance: 30m

Creates TWO tasks in tasks_done:

Task 1: "Excavation soil with Small Digger (3t)"
  - hours_worked: 15 * 0.02 = 0.3 h
  - event_task_id: [link to template]

Task 2: "Transporting soil with Medium Dumper (5t) - 30m"
  - Calculation:
    * capacity: 5 tons/trip
    * trips: ceil(15/5) = 3
    * time per trip: (30*2)/7000 = 0.00857 h
    * total: 3 * 0.00857 = 0.0257 h
  - hours_worked: 0.0257 h
  - event_task_id: null (dynamic!)
  - description: Full breakdown with trips, speed, etc.

Total time: 0.3 + 0.0257 = 0.3257 hours
```

#### Pile Up (distance = 0):
```
Input:
  - Excavator: Small Digger (3t)
  - Carrier: Medium Dumper (5t)  ← still needs to be selected
  - Soil: 15 tons
  - Distance: 0m

Creates ONE task:

Task 1: "Excavation soil with Small Digger (3t)"
  - hours_worked: 0.3 h
  - event_task_id: [link to template]

❌ NO transport task (distance = 0)
```

---

## Code Changes

### Files Modified:
1. ✅ `supabase/migrations/20260208_add_speed_to_setup_digging.sql` - NEW
2. ✅ `src/lib/database.types.ts` - Added `speed_m_per_hour`
3. ✅ `src/pages/ProjectManagement/Setup/SetupDigging.tsx` - Speed field + auto-task creation
4. ✅ `src/projectmanagement/ProjectCreating.tsx` - New system implementation

### Removed:
- ❌ Excavation option radio buttons (Removal/Pile Up)
- ❌ `findDiggerTimeEstimate()` - old function
- ❌ `findCarrierTimeEstimate()` - old function
- ❌ Import of `carrierSpeeds` from constants
- ❌ Duplicate useEffects that caused infinite loop
- ❌ Local state for excavators/carriers (now using query data directly)
- ❌ "Create Tasks" button in SetupDigging
- ❌ MachineryTaskCreator component usage

### Added:
- ✅ `speed_m_per_hour` field in setup_digging
- ✅ Speed input field in UI (carriers only)
- ✅ Auto-creation of excavation tasks when adding excavators
- ✅ `findSoilDiggerTimeEstimate()` function in SetupDigging
- ✅ Separate excavation and transport tasks
- ✅ Dynamic transport calculation with actual carrier speed
- ✅ Detailed breakdown in transport task descriptions

---

## Transport Time Calculation Formula

### Old System (REMOVED):
```typescript
// Hardcoded multipliers
if (carrierSize <= 3) return totalTons * 0.4;
if (carrierSize <= 8) return totalTons * 0.3;
return totalTons * 0.2;
```

### New System (ACTIVE):
```typescript
function calculateTransportTimeWithDistance(
  carrierSize: number,
  totalTons: number,
  distanceMeters: number,
  carrierSpeed: number  // FROM DATABASE!
) {
  const capacity = getMaterialCapacity('soil', carrierSize);
  const trips = Math.ceil(totalTons / capacity);
  const timePerTrip = (distanceMeters * 2) / carrierSpeed;
  return trips * timePerTrip;
}
```

**Example:**
- 15 tons soil
- 5t carrier @ 7000 m/h
- 30m distance
- Capacity: 5 tons/trip
- Trips: 3
- Time/trip: 60m / 7000 = 0.00857 h
- Total: 3 × 0.00857 = **0.0257 hours**

---

## Testing Checklist

### Setup Phase:
- [ ] Add excavator → check console for auto-created task
- [ ] Verify task appears in Task Templates
- [ ] Add carrier with custom speed
- [ ] Edit existing carrier speed
- [ ] Verify speed column in table

### Project Creation:
- [ ] Select excavator & carrier
- [ ] Set distance = 30m → verify 2 tasks created
- [ ] Set distance = 0 → verify only excavation task created
- [ ] Check task descriptions have breakdown
- [ ] Verify hours calculation is accurate
- [ ] Check estimated time display updates

### Edge Cases:
- [ ] Carrier without speed (should fallback to 4000 m/h)
- [ ] Very long distance (500m)
- [ ] Very short distance (5m)
- [ ] Multiple main tasks (check soil accumulation)

---

## Migration Steps

1. **Backup database** (recommended)
2. **Run migration**: `20260208_add_speed_to_setup_digging.sql`
3. **Deploy code changes**
4. **Verify existing carriers** have speed populated
5. **Test project creation** with existing equipment
6. **Add new equipment** to test auto-task creation

---

## Breaking Changes

⚠️ **Template Changes:**
- Old combined tasks like "Excavation soil with Digger 3-5T and Dumper 5t" are no longer created
- Only excavation tasks (without carrier) are created in event_tasks
- Transport tasks are created dynamically without templates

⚠️ **UI Changes:**
- "Pile Up" option removed - use distance=0 instead
- Carrier machinery always visible (not conditional)
- Speed displayed in carrier list

---

## Rollback Plan

If issues occur:

1. **Revert code** to previous commit
2. **Keep migration** (speed_m_per_hour column doesn't break old system)
3. Old system will fallback to 4000 m/h for carriers without speed

---

## Future Improvements

1. Add capacity editing for carriers (currently uses hardcoded `materialCapacity`)
2. Add speed editing for excavators (loading operations)
3. Historical transport data analysis by distance
4. Optimize transport route recommendations

---

Generated: 2026-02-08
System: Excavation and Transport Calculation
Version: 2.0 (Dynamic Transport System)
