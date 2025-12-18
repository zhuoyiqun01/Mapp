import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Image, PenTool } from 'lucide-react';

interface DuplicateInfo {
  importIndex: number;
  existingNoteId: string;
  duplicateType: 'image' | 'sketch' | 'both';
  existingNoteTitle?: string;
}

interface Resolution {
  importIndex: number;
  action: 'skip' | 'replace' | 'keep_both';
}

interface ImportDuplicateDialogProps {
  duplicates: DuplicateInfo[];
  importNotes: any[]; // Note[] 类型，暂时用any[]避免导入类型问题
  onResolve: (resolutions: Resolution[]) => void;
  onCancel: () => void;
}

export const ImportDuplicateDialog: React.FC<ImportDuplicateDialogProps> = ({
  duplicates,
  importNotes,
  onResolve,
  onCancel
}) => {
  const [resolutions, setResolutions] = useState<Resolution[]>([]);

  // 为每个重复项默认选择"skip"
  useEffect(() => {
    const defaultResolutions = duplicates.map(dup => ({
      importIndex: dup.importIndex,
      action: 'skip' as const
    }));
    setResolutions(defaultResolutions);
  }, [duplicates]);

  const updateResolution = (importIndex: number, action: 'skip' | 'replace' | 'keep_both') => {
    setResolutions(prev =>
      prev.map(res =>
        res.importIndex === importIndex ? { ...res, action } : res
      )
    );
  };

  const getDuplicateIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image size={16} className="text-blue-500" />;
      case 'sketch': return <PenTool size={16} className="text-green-500" />;
      case 'both': return (
        <div className="flex gap-1">
          <Image size={16} className="text-blue-500" />
          <PenTool size={16} className="text-green-500" />
        </div>
      );
      default: return null;
    }
  };

  const getDuplicateTypeText = (type: string) => {
    switch (type) {
      case 'image': return '图片';
      case 'sketch': return '涂鸦';
      case 'both': return '图片和涂鸦';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={24} className="text-orange-500" />
            <h2 className="text-xl font-bold text-gray-800">发现重复内容</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4 text-sm text-gray-600">
            导入的数据中发现 {duplicates.length} 个与当前项目重复的内容。请为每个重复项选择处理方式：
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {duplicates.map((dup, index) => {
              const importNote = importNotes[dup.importIndex];
              const currentResolution = resolutions.find(r => r.importIndex === dup.importIndex);

              return (
                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start gap-3 mb-3">
                    {getDuplicateIcon(dup.duplicateType)}
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">
                        导入便签 #{dup.importIndex + 1}
                        {importNote?.title && <span className="ml-2 text-sm">"{importNote.title}"</span>}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        与现有便签重复 • 重复类型: {getDuplicateTypeText(dup.duplicateType)}
                        {dup.existingNoteTitle && <span className="ml-2">现有便签: "{dup.existingNoteTitle}"</span>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 ml-7">
                    <label className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded">
                      <input
                        type="radio"
                        name={`dup-${dup.importIndex}`}
                        checked={currentResolution?.action === 'skip'}
                        onChange={() => updateResolution(dup.importIndex, 'skip')}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium text-gray-700">跳过导入</div>
                        <div className="text-sm text-gray-500">保留现有的便签，忽略导入的这个</div>
                      </div>
                    </label>

                    <label className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded">
                      <input
                        type="radio"
                        name={`dup-${dup.importIndex}`}
                        checked={currentResolution?.action === 'replace'}
                        onChange={() => updateResolution(dup.importIndex, 'replace')}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium text-gray-700">替换现有</div>
                        <div className="text-sm text-gray-500">删除现有的，导入新的便签</div>
                      </div>
                    </label>

                    <label className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded">
                      <input
                        type="radio"
                        name={`dup-${dup.importIndex}`}
                        checked={currentResolution?.action === 'keep_both'}
                        onChange={() => updateResolution(dup.importIndex, 'keep_both')}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium text-gray-700">保留两者</div>
                        <div className="text-sm text-gray-500">导入新的便签作为副本</div>
                      </div>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={() => onResolve(resolutions)}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            确认导入 ({resolutions.filter(r => r.action !== 'skip').length} 个)
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            取消导入
          </button>
        </div>
      </div>
    </div>
  );
};
