import { useState, useEffect, useCallback } from 'react';
import type { Tenant } from '@fyre-db/core';
import { fyredb, taskDef } from './fyredb';
import type { Task } from './fyredb';
import { useQuery } from './hooks';

// ─── Tenant Picker ───────────────────────────────────────

function TenantPicker({
  tenants,
  activeTenantId,
  onSelect,
  onCreate,
}: {
  tenants: ReadonlyArray<Tenant>;
  activeTenantId: string | undefined;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [newName, setNewName] = useState('');

  return (
    <div className="card">
      <h2>Tenants</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        {tenants.map((t) => (
          <button
            key={t.id}
            className={`tenant-btn ${t.id === activeTenantId ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            {t.name}
          </button>
        ))}
        {tenants.length === 0 && <span style={{ color: '#999' }}>No tenants yet</span>}
      </div>
      <div className="add-form">
        <input
          placeholder="New tenant name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              onCreate(newName.trim());
              setNewName('');
            }
          }}
        />
        <button
          className="primary"
          onClick={() => {
            if (newName.trim()) {
              onCreate(newName.trim());
              setNewName('');
            }
          }}
        >
          Create
        </button>
      </div>
    </div>
  );
}

// ─── Add Task Form ───────────────────────────────────────

function AddTaskForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');

  return (
    <div className="add-form">
      <input
        placeholder="Add a task..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim()) {
            onAdd(title.trim());
            setTitle('');
          }
        }}
      />
      <button
        className="primary"
        onClick={() => {
          if (title.trim()) {
            onAdd(title.trim());
            setTitle('');
          }
        }}
      >
        Add
      </button>
    </div>
  );
}

// ─── Task List (reactive) ────────────────────────────────

function TaskList() {
  const repo = fyredb.repo(taskDef);
  const tasks = useQuery<Task>(repo);

  const toggle = useCallback(
    (task: Task & { id: string; done: boolean }) => {
      repo.save({ ...task, done: !task.done });
    },
    [repo],
  );

  const remove = useCallback(
    (id: string) => {
      repo.delete(id);
    },
    [repo],
  );

  const add = useCallback(
    (title: string) => {
      repo.save({ title, done: false });
    },
    [repo],
  );

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="card">
      <h2>Tasks ({tasks.length} total, {doneCount} done)</h2>
      <AddTaskForm onAdd={add} />
      {tasks.length === 0 && <p style={{ color: '#999' }}>No tasks yet. Add one above.</p>}
      {tasks.map((task) => (
        <div className="task-row" key={task.id}>
          <input
            type="checkbox"
            checked={task.done}
            onChange={() => toggle(task)}
          />
          <span className={`task-title ${task.done ? 'done' : ''}`}>
            {task.title}
          </span>
          <button className="danger" onClick={() => remove(task.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────

export default function App() {
  const [tenants, setTenants] = useState<ReadonlyArray<Tenant>>([]);
  const [activeTenantId, setActiveTenantId] = useState<string>();
  const [loading, setLoading] = useState(false);

  // Load tenant list on mount
  useEffect(() => {
    fyredb.tenants.list().then(setTenants);
  }, []);

  const handleCreate = useCallback(async (name: string) => {
    const tenant = await fyredb.tenants.create({ name, meta: {} });
    const list = await fyredb.tenants.list();
    setTenants(list);
    // Auto-load the new tenant
    setLoading(true);
    await fyredb.loadTenant(tenant.id);
    setActiveTenantId(tenant.id);
    setLoading(false);
  }, []);

  const handleSelect = useCallback(async (id: string) => {
    if (id === activeTenantId) return;
    setLoading(true);
    await fyredb.loadTenant(id);
    setActiveTenantId(id);
    setLoading(false);
  }, [activeTenantId]);

  return (
    <div>
      <h1>FyreDb React Example</h1>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Multi-tenant task manager with reactive updates
      </p>

      <TenantPicker
        tenants={tenants}
        activeTenantId={activeTenantId}
        onSelect={handleSelect}
        onCreate={handleCreate}
      />

      {loading && <p>Loading tenant...</p>}

      {activeTenantId && !loading && <TaskList />}

      {!activeTenantId && !loading && (
        <div className="card">
          <p style={{ color: '#999', textAlign: 'center' }}>
            Create or select a tenant to get started
          </p>
        </div>
      )}
    </div>
  );
}
