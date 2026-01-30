const taskForm = document.getElementById('task-form');
const taskTable = document.getElementById('task-table');
const dependencyForm = document.getElementById('dependency-form');
const dependencyList = document.getElementById('dependency-list');
const dependencyFrom = document.getElementById('dependency-from');
const dependencyTo = document.getElementById('dependency-to');
const scheduleList = document.getElementById('schedule-list');
const projectDurationEl = document.getElementById('project-duration');
const criticalTasksEl = document.getElementById('critical-tasks');
const ganttEl = document.getElementById('gantt');
const ganttScaleEl = document.getElementById('gantt-scale');

let tasks = [
  { code: 'T1', name: 'Inventaire', duration: 2 },
  { code: 'T2', name: 'Achat licences', duration: 2 },
  { code: 'T3', name: 'Sauvegarde', duration: 3 },
  { code: 'T4', name: 'Installation', duration: 2 },
  { code: 'T5', name: 'Tests', duration: 1 }
];

let dependencies = [
  { from: 'T1', to: 'T2' },
  { from: 'T1', to: 'T3' },
  { from: 'T2', to: 'T4' },
  { from: 'T3', to: 'T4' },
  { from: 'T4', to: 'T5' }
];

let cyInstance = null;
let editingCode = null;

const normalizeCode = (value) => value.trim().toUpperCase();

const findTask = (code) => tasks.find((task) => task.code === code);

const buildGraph = () => {
  const nodes = [
    { data: { id: 'START', label: 'Début' } },
    { data: { id: 'END', label: 'Fin' } }
  ];

  tasks.forEach((task) => {
    nodes.push({ data: { id: task.code, label: `${task.code}\n${task.name}\n${task.duration}j` } });
  });

  const edges = [];
  const successors = new Map();
  const predecessors = new Map();

  tasks.forEach((task) => {
    successors.set(task.code, []);
    predecessors.set(task.code, []);
  });

  dependencies.forEach((dep) => {
    if (successors.has(dep.from) && predecessors.has(dep.to)) {
      successors.get(dep.from).push(dep.to);
      predecessors.get(dep.to).push(dep.from);
      edges.push({ data: { id: `${dep.from}-${dep.to}`, source: dep.from, target: dep.to } });
    }
  });

  tasks.forEach((task) => {
    if (predecessors.get(task.code)?.length === 0) {
      edges.push({ data: { id: `START-${task.code}`, source: 'START', target: task.code } });
    }
  });

  tasks.forEach((task) => {
    if (successors.get(task.code)?.length === 0) {
      edges.push({ data: { id: `${task.code}-END`, source: task.code, target: 'END' } });
    }
  });

  return { nodes, edges, successors, predecessors };
};

const computeSchedule = () => {
  const { successors, predecessors } = buildGraph();
  const inDegree = new Map();
  const earliestStart = new Map();
  const earliestFinish = new Map();
  const latestStart = new Map();
  const latestFinish = new Map();

  tasks.forEach((task) => {
    inDegree.set(task.code, predecessors.get(task.code)?.length ?? 0);
    earliestStart.set(task.code, 0);
    earliestFinish.set(task.code, task.duration);
  });

  const queue = tasks.filter((task) => inDegree.get(task.code) === 0).map((task) => task.code);
  const order = [];

  while (queue.length) {
    const code = queue.shift();
    order.push(code);
    const baseFinish = earliestFinish.get(code);
    (successors.get(code) || []).forEach((next) => {
      const nextTask = findTask(next);
      const candidateStart = baseFinish;
      if (candidateStart > (earliestStart.get(next) ?? 0)) {
        earliestStart.set(next, candidateStart);
        earliestFinish.set(next, candidateStart + (nextTask?.duration ?? 0));
      }
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) {
        queue.push(next);
      }
    });
  }

  const projectDuration = Math.max(0, ...Array.from(earliestFinish.values()));

  const reverseOrder = [...order].reverse();
  reverseOrder.forEach((code) => {
    const task = findTask(code);
    const successorsList = successors.get(code) || [];
    if (successorsList.length === 0) {
      latestFinish.set(code, projectDuration);
    } else {
      const minLatestStart = Math.min(...successorsList.map((succ) => latestStart.get(succ) ?? projectDuration));
      latestFinish.set(code, minLatestStart);
    }
    latestStart.set(code, (latestFinish.get(code) ?? projectDuration) - (task?.duration ?? 0));
  });

  const slack = new Map();
  tasks.forEach((task) => {
    slack.set(task.code, (latestStart.get(task.code) ?? 0) - (earliestStart.get(task.code) ?? 0));
  });

  const criticalTasks = tasks.filter((task) => slack.get(task.code) === 0).map((task) => task.code);

  const criticalEdges = new Set();
  dependencies.forEach((dep) => {
    const start = earliestStart.get(dep.from) ?? 0;
    const finish = earliestFinish.get(dep.from) ?? 0;
    const nextStart = earliestStart.get(dep.to) ?? 0;
    if (finish === nextStart && slack.get(dep.from) === 0 && slack.get(dep.to) === 0) {
      criticalEdges.add(`${dep.from}-${dep.to}`);
    }
  });

  return {
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    slack,
    projectDuration,
    criticalTasks,
    criticalEdges,
    order
  };
};

const renderTasks = () => {
  taskTable.innerHTML = '';
  tasks.forEach((task) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="py-2 font-semibold">${task.code}</td>
      <td class="py-2">${task.name}</td>
      <td class="py-2">${task.duration} j</td>
      <td class="py-2">
        <button data-action="edit" data-code="${task.code}" class="text-cyan-400 hover:text-cyan-300">Éditer</button>
        <button data-action="delete" data-code="${task.code}" class="ml-3 text-rose-400 hover:text-rose-300">Supprimer</button>
      </td>
    `;
    taskTable.appendChild(row);
  });
};

const renderDependencies = () => {
  dependencyList.innerHTML = '';
  dependencies.forEach((dep, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm';
    item.innerHTML = `
      <span>${dep.from} → ${dep.to}</span>
      <button data-index="${index}" class="text-rose-400 hover:text-rose-300">Supprimer</button>
    `;
    dependencyList.appendChild(item);
  });
};

const renderSelectors = () => {
  const options = tasks.map((task) => `<option value="${task.code}">${task.code} - ${task.name}</option>`).join('');
  dependencyFrom.innerHTML = options;
  dependencyTo.innerHTML = options;
};

const renderSchedule = () => {
  const { earliestStart, earliestFinish, latestStart, latestFinish, slack, projectDuration, criticalTasks } = computeSchedule();

  projectDurationEl.textContent = `${projectDuration} jours`;
  criticalTasksEl.textContent = criticalTasks.length ? criticalTasks.join(', ') : 'Aucune';

  scheduleList.innerHTML = '';
  tasks.forEach((task) => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between border border-slate-800 rounded-lg px-3 py-2';
    const criticalBadge = criticalTasks.includes(task.code)
      ? '<span class="text-xs text-rose-300 bg-rose-500/10 px-2 py-1 rounded-full">Critique</span>'
      : '';
    item.innerHTML = `
      <div>
        <p class="font-semibold">${task.code} - ${task.name}</p>
        <p class="text-xs text-slate-400">ES ${earliestStart.get(task.code)}j • EF ${earliestFinish.get(task.code)}j</p>
        <p class="text-xs text-slate-400">LS ${latestStart.get(task.code)}j • LF ${latestFinish.get(task.code)}j • Marge ${slack.get(task.code)}j</p>
      </div>
      ${criticalBadge}
    `;
    scheduleList.appendChild(item);
  });
};

const renderGantt = () => {
  const { earliestStart, earliestFinish, projectDuration, criticalTasks } = computeSchedule();
  ganttEl.innerHTML = '';
  ganttScaleEl.innerHTML = '';

  const scale = document.createElement('div');
  scale.className = 'grid gap-1 text-xs text-slate-400';
  scale.style.gridTemplateColumns = `140px repeat(${Math.max(projectDuration, 1)}, minmax(0, 1fr))`;

  const scaleLabel = document.createElement('div');
  scaleLabel.className = 'text-slate-500';
  scaleLabel.textContent = 'Jours';
  scale.appendChild(scaleLabel);

  for (let day = 1; day <= Math.max(projectDuration, 1); day += 1) {
    const tick = document.createElement('div');
    tick.className = 'text-center';
    tick.textContent = day;
    scale.appendChild(tick);
  }

  ganttScaleEl.appendChild(scale);

  tasks.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'grid gap-2 items-center';
    row.style.gridTemplateColumns = `140px 1fr`;

    const label = document.createElement('div');
    label.className = 'text-sm';
    label.textContent = `${task.code} ${task.name}`;

    const timeline = document.createElement('div');
    timeline.className = 'relative h-8 rounded-lg border border-slate-800 bg-slate-950';
    timeline.style.backgroundImage = 'linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px)';
    timeline.style.backgroundSize = `${100 / Math.max(projectDuration, 1)}% 100%`;

    const bar = document.createElement('div');
    const start = earliestStart.get(task.code) || 0;
    const finish = earliestFinish.get(task.code) || 0;
    const widthPercent = projectDuration > 0 ? ((finish - start) / projectDuration) * 100 : 0;
    const leftPercent = projectDuration > 0 ? (start / projectDuration) * 100 : 0;

    bar.className = `absolute top-1/2 -translate-y-1/2 h-4 rounded-full ${criticalTasks.includes(task.code) ? 'bg-rose-500' : 'bg-cyan-500'}`;
    bar.style.left = `${leftPercent}%`;
    bar.style.width = `${Math.max(widthPercent, 2)}%`;

    const text = document.createElement('span');
    text.className = 'absolute inset-y-0 left-2 text-[10px] text-slate-950 font-semibold flex items-center';
    text.textContent = `${start} → ${finish} j`;

    timeline.appendChild(bar);
    timeline.appendChild(text);
    row.appendChild(label);
    row.appendChild(timeline);
    ganttEl.appendChild(row);
  });
};

const renderCytoscape = () => {
  const { nodes, edges } = buildGraph();
  const { criticalTasks, criticalEdges } = computeSchedule();

  if (cyInstance) {
    cyInstance.destroy();
  }

  cyInstance = cytoscape({
    container: document.getElementById('cy'),
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          'background-color': '#0f172a',
          'border-color': '#38bdf8',
          'border-width': 2,
          'label': 'data(label)',
          'text-wrap': 'wrap',
          'text-max-width': 110,
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': 10,
          'color': '#e2e8f0'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#64748b',
          'target-arrow-color': '#64748b',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier'
        }
      },
      {
        selector: 'node.critical',
        style: {
          'border-color': '#fb7185',
          'border-width': 3
        }
      },
      {
        selector: 'edge.critical',
        style: {
          'line-color': '#fb7185',
          'target-arrow-color': '#fb7185',
          'width': 4
        }
      }
    ],
    layout: {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.5,
      padding: 20,
      roots: ['START']
    }
  });

  criticalTasks.forEach((code) => {
    cyInstance.getElementById(code).addClass('critical');
  });
  criticalEdges.forEach((edgeId) => {
    cyInstance.getElementById(edgeId).addClass('critical');
  });
};

const refresh = () => {
  renderTasks();
  renderDependencies();
  renderSelectors();
  renderSchedule();
  renderGantt();
  renderCytoscape();
};

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const code = normalizeCode(document.getElementById('task-code').value);
  const name = document.getElementById('task-name').value.trim();
  const duration = Number(document.getElementById('task-duration').value);

  if (!code || !name || duration <= 0) return;

  if (editingCode) {
    tasks = tasks.map((task) => (task.code === editingCode ? { code, name, duration } : task));
    dependencies = dependencies.filter((dep) => dep.from !== editingCode && dep.to !== editingCode);
    editingCode = null;
    taskForm.querySelector('button[type="submit"]').textContent = 'Ajouter';
  } else if (findTask(code)) {
    alert('Ce code existe déjà.');
    return;
  } else {
    tasks.push({ code, name, duration });
  }

  taskForm.reset();
  refresh();
});

taskTable.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const code = button.dataset.code;
  if (button.dataset.action === 'delete') {
    tasks = tasks.filter((task) => task.code !== code);
    dependencies = dependencies.filter((dep) => dep.from !== code && dep.to !== code);
    refresh();
  }
  if (button.dataset.action === 'edit') {
    const task = findTask(code);
    if (!task) return;
    document.getElementById('task-code').value = task.code;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-duration').value = task.duration;
    editingCode = task.code;
    taskForm.querySelector('button[type="submit"]').textContent = 'Mettre à jour';
  }
});

dependencyForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const from = dependencyFrom.value;
  const to = dependencyTo.value;
  if (from === to) {
    alert('Une tâche ne peut pas dépendre d’elle-même.');
    return;
  }
  const exists = dependencies.some((dep) => dep.from === from && dep.to === to);
  if (!exists) {
    dependencies.push({ from, to });
    refresh();
  }
});

dependencyList.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const index = Number(button.dataset.index);
  dependencies.splice(index, 1);
  refresh();
});

refresh();
