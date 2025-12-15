import { get, set, del, keys } from 'idb-keyval';
import { Project, Note } from '../types';

// Storage keys
const PROJECT_LIST_KEY = 'mapp-project-list';
const PROJECT_PREFIX = 'mapp-project-';
const IMAGE_PREFIX = 'mapp-image-';
const SKETCH_PREFIX = 'mapp-sketch-';
const BACKGROUND_IMAGE_PREFIX = 'mapp-bg-';
const STORAGE_VERSION_KEY = 'mapp-storage-version';
const CURRENT_STORAGE_VERSION = 2; // 版本号，用于数据迁移

// 生成图片 ID
function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 从 Base64 中提取图片 ID（如果是旧格式的 Base64，返回 null）
function extractImageId(imageData: string): string | null {
  if (imageData.startsWith('img-')) {
    return imageData; // 已经是图片 ID
  }
  return null; // 是 Base64 数据，需要转换
}

// 保存图片到 IndexedDB，返回图片 ID
export async function saveImage(base64Data: string): Promise<string> {
  const imageId = generateImageId();
  await set(`${IMAGE_PREFIX}${imageId}`, base64Data);
  return imageId;
}

// 从 IndexedDB 加载图片
export async function loadImage(imageId: string): Promise<string | null> {
  return await get<string>(`${IMAGE_PREFIX}${imageId}`);
}

// 保存 sketch 到 IndexedDB，返回 sketch ID
export async function saveSketch(base64Data: string): Promise<string> {
  const sketchId = generateImageId();
  await set(`${SKETCH_PREFIX}${sketchId}`, base64Data);
  return sketchId;
}

// 从 IndexedDB 加载 sketch
export async function loadSketch(sketchId: string): Promise<string | null> {
  return await get<string>(`${SKETCH_PREFIX}${sketchId}`);
}

// 保存背景图片
export async function saveBackgroundImage(projectId: string, base64Data: string): Promise<string> {
  const imageId = generateImageId();
  await set(`${BACKGROUND_IMAGE_PREFIX}${projectId}`, base64Data);
  return imageId;
}

// 加载背景图片
export async function loadBackgroundImage(projectId: string): Promise<string | null> {
  return await get<string>(`${BACKGROUND_IMAGE_PREFIX}${projectId}`);
}

// 删除图片
export async function deleteImage(imageId: string): Promise<void> {
  await del(`${IMAGE_PREFIX}${imageId}`);
}

// 删除 sketch
export async function deleteSketch(sketchId: string): Promise<void> {
  await del(`${SKETCH_PREFIX}${sketchId}`);
}

// 确保Note有variant字段
function ensureNoteVariant(note: Note): Note {
  if (!note.variant) {
    // 根据特征判断：如果有imageWidth和imageHeight，且images有内容，可能是image类型
    if (note.imageWidth && note.imageHeight && note.images && note.images.length > 0) {
      return { ...note, variant: 'image' };
    }
    // 如果没有emoji，可能是compact类型
    if (!note.emoji || note.emoji === '') {
      return { ...note, variant: 'compact' };
    }
    // 默认是standard
    return { ...note, variant: 'standard' };
  }
  return note;
}

// 转换 Note 的图片从 Base64 到图片 ID（用于迁移）
async function migrateNoteImages(note: Note): Promise<Note> {
  const migratedNote = ensureNoteVariant({ ...note });
  
  // 迁移 images 数组
  if (note.images && note.images.length > 0) {
    const imageIds: string[] = [];
    for (const imageData of note.images) {
      const existingId = extractImageId(imageData);
      if (existingId) {
        imageIds.push(existingId);
      } else {
        // 是 Base64，需要保存并获取 ID
        const imageId = await saveImage(imageData);
        imageIds.push(imageId);
      }
    }
    migratedNote.images = imageIds;
  }
  
  // 迁移 sketch
  if (note.sketch) {
    const existingId = extractImageId(note.sketch);
    if (existingId) {
      migratedNote.sketch = existingId;
    } else {
      // 是 Base64，需要保存并获取 ID
      const sketchId = await saveSketch(note.sketch);
      migratedNote.sketch = sketchId;
    }
  }
  
  return migratedNote;
}

// 加载 Note 的图片（将图片 ID 转换为 Base64）
export async function loadNoteImages(note: Note): Promise<Note> {
  const loadedNote = { ...note };
  
  // 加载 images 数组
  if (note.images && note.images.length > 0) {
    const loadedImages: string[] = [];
    for (const imageId of note.images) {
      const existingId = extractImageId(imageId);
      if (existingId) {
        // 是图片 ID，需要加载
        const imageData = await loadImage(existingId);
        if (imageData) {
          loadedImages.push(imageData);
        }
      } else {
        // 是 Base64（旧格式），直接使用
        loadedImages.push(imageId);
      }
    }
    loadedNote.images = loadedImages;
  }
  
  // 加载 sketch
  if (note.sketch) {
    const existingId = extractImageId(note.sketch);
    if (existingId) {
      const sketchData = await loadSketch(existingId);
      if (sketchData) {
        loadedNote.sketch = sketchData;
      }
    }
    // 如果已经是 Base64，保持不变
  }
  
  return loadedNote;
}

// 保存项目（分片存储，图片分离）
export async function saveProject(project: Project): Promise<void> {
  // 1. 迁移项目中的图片
  const migratedProject = { ...project };
  
  // 迁移所有 notes 的图片
  migratedProject.notes = await Promise.all(
    project.notes.map(note => migrateNoteImages(note))
  );
  
  // 迁移背景图片
  if (project.backgroundImage) {
    const existingId = extractImageId(project.backgroundImage);
    if (!existingId) {
      // 是 Base64，需要保存
      await saveBackgroundImage(project.id, project.backgroundImage);
      // 项目数据中不存储 Base64，只标记有背景图片
      migratedProject.backgroundImage = 'stored'; // 标记为已存储
    }
  }
  
  // 2. 添加版本号
  const projectWithVersion = {
    ...migratedProject,
    version: Date.now(), // 使用时间戳作为版本号
    storageVersion: CURRENT_STORAGE_VERSION
  };
  
  // 3. 保存项目数据（不包含 Base64 图片）
  await set(`${PROJECT_PREFIX}${project.id}`, projectWithVersion);
  
  // 4. 更新项目列表
  const projectList = await get<string[]>(PROJECT_LIST_KEY) || [];
  if (!projectList.includes(project.id)) {
    projectList.push(project.id);
    await set(PROJECT_LIST_KEY, projectList);
  }
}

// 加载项目（按需加载，图片懒加载）
export async function loadProject(projectId: string, loadImages: boolean = false): Promise<Project | null> {
  const project = await get<Project>(`${PROJECT_PREFIX}${projectId}`);
  if (!project) {
    return null;
  }
  
  // 确保所有notes都有variant
  if (project.notes) {
    project.notes = project.notes.map(ensureNoteVariant);
  }
  
  // 如果需要加载图片，则加载所有图片
  if (loadImages) {
    // 加载背景图片
    if (project.backgroundImage === 'stored') {
      const bgImage = await loadBackgroundImage(projectId);
      if (bgImage) {
        project.backgroundImage = bgImage;
      }
    }
    
    // 加载所有 notes 的图片
    project.notes = await Promise.all(
      project.notes.map(note => loadNoteImages(note))
    );
  }
  
  return project;
}

// 加载所有项目 ID 列表
export async function loadProjectList(): Promise<string[]> {
  return await get<string[]>(PROJECT_LIST_KEY) || [];
}

// 加载所有项目（不加载图片，用于列表显示）
export async function loadAllProjects(loadImages: boolean = false): Promise<Project[]> {
  const projectList = await loadProjectList();
  const projects = await Promise.all(
    projectList.map(id => loadProject(id, loadImages))
  );
  return projects.filter((p): p is Project => p !== null);
}

// 删除项目
export async function deleteProject(projectId: string): Promise<void> {
  const project = await loadProject(projectId, false);
  if (project) {
    // 删除所有图片
    for (const note of project.notes) {
      if (note.images) {
        for (const imageId of note.images) {
          const existingId = extractImageId(imageId);
          if (existingId) {
            await deleteImage(existingId);
          }
        }
      }
      if (note.sketch) {
        const existingId = extractImageId(note.sketch);
        if (existingId) {
          await deleteSketch(existingId);
        }
      }
    }
    
    // 删除背景图片
    await del(`${BACKGROUND_IMAGE_PREFIX}${projectId}`);
  }
  
  // 删除项目数据
  await del(`${PROJECT_PREFIX}${projectId}`);
  
  // 更新项目列表
  const projectList = await loadProjectList();
  const updatedList = projectList.filter(id => id !== projectId);
  await set(PROJECT_LIST_KEY, updatedList);
}

// 数据迁移：从旧格式迁移到新格式
export async function migrateFromOldFormat(): Promise<void> {
  const currentVersion = await get<number>(STORAGE_VERSION_KEY) || 1;
  
  if (currentVersion >= CURRENT_STORAGE_VERSION) {
    return; // 已经是最新版本
  }
  
  console.log('开始数据迁移...');
  
  // 尝试从旧格式加载
  const oldProjects = await get<Project[]>('mapp-projects');
  
  if (oldProjects && oldProjects.length > 0) {
    console.log(`发现 ${oldProjects.length} 个旧格式项目，开始迁移...`);
    
    // 迁移每个项目
    for (const project of oldProjects) {
      await saveProject(project);
    }
    
    // 删除旧数据
    await del('mapp-projects');
    console.log('旧数据已删除');
  }
  
  // 更新版本号
  await set(STORAGE_VERSION_KEY, CURRENT_STORAGE_VERSION);
  console.log('数据迁移完成');
}

// 获取项目的版本号（用于增量同步）
export async function getProjectVersion(projectId: string): Promise<number> {
  const project = await loadProject(projectId, false);
  return project?.version || 0;
}

