import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DotsThree, FolderMinus, PencilSimple, Trash } from '@phosphor-icons/react';
import { useApp } from '@/lib/store';
import type { BackgroundItem } from '@/lib/types';
import { useT } from '@/hooks/use-t';
import type { WorldRef } from '@/lib/world';
import { loadWorldBackgrounds, linkWorldBackgrounds } from '@/lib/world';
import {
  toSnake,
  isSnake,
  uniqueName,
  parseTags,
  formatBytes,
} from '@/lib/world-backgrounds';
import { storeBackground } from '@/lib/webp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm';
import { MakeSet } from './world-bg-set';
import { NameWithVision } from './world-bg-name';
import { AutoBackground } from './world-auto-bg';
import { AddExistingDialog } from './world-bg-existing';

type ConfirmFn = (opts: { title: string; description?: string; actionLabel?: string; destructive?: boolean }) => Promise<boolean>;

function ImageCard({
  item,
  folderId,
  all,
  confirm,
}: {
  item: BackgroundItem;
  folderId: string;
  all: BackgroundItem[];
  confirm: ConfirmFn;
}) {
  const t = useT();
  const updateBackground = useApp((s) => s.updateBackground);
  const deleteBackground = useApp((s) => s.deleteBackground);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editTags, setEditTags] = useState(item.tags?.join(', ') ?? '');

  const otherNames = useMemo(
    () => all.filter((b) => b.id !== item.id && b.folderId === folderId).map((b) => b.name),
    [all, item.id, folderId]
  );

  const tags = item.tags ?? [];

  const handleSave = () => {
    const raw = editName.trim();
    const snake = toSnake(raw);
    if (!isSnake(snake)) {
      toast.info(t('world.bg.nameBad'));
      return;
    }
    const finalName = uniqueName(snake, otherNames);
    updateBackground(item.id, {
      name: finalName,
      tags: parseTags(editTags),
    });
    if (finalName !== raw) {
      toast.info(t('world.bg.nameBad'));
    }
    setEditing(false);
  };

  const handleRemoveFromFolder = () => {
    updateBackground(item.id, { folderId: null });
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('world.bg.deleteTitle', { name: item.name }),
      description: t('world.bg.deleteWarn'),
      actionLabel: t('world.bg.delete'),
    });
    if (ok) deleteBackground(item.id);
  };

  return (
    <figure className="group flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
        <img
          src={item.url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <figcaption className="min-w-0">
        <div className="truncate text-xs font-medium" title={item.name}>
          {item.name}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]">
              +{tags.length - 4}
            </span>
          )}
        </div>
      </figcaption>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('world.bg.edit')}
          className="h-9 w-9 max-md:h-10 max-md:w-10"
          onClick={() => setEditing((v) => !v)}
          data-testid="bg-edit"
        >
          <PencilSimple size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('world.bg.removeFrom')}
          className="h-9 w-9 max-md:h-10 max-md:w-10"
          onClick={handleRemoveFromFolder}
        >
          <FolderMinus size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('world.bg.delete')}
          className="h-9 w-9 max-md:h-10 max-md:w-10"
          onClick={handleDelete}
        >
          <Trash size={16} />
        </Button>
      </div>
      {editing && (
        <div className="flex flex-col gap-2">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            aria-label={t('bg.tab.nameLabel')}
            className="h-10 md:h-9"
          />
          <Input
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder={t('bg.tab.tagsPh')}
            aria-label={t('bg.tab.tagsLabel')}
            className="h-10 md:h-9"
          />
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={handleSave}
            data-testid="bg-save"
          >
            {t('world.bg.save')}
          </Button>
        </div>
      )}
    </figure>
  );
}

export function WorldBackgrounds({
  wref,
  worldName,
  onOpenSettings,
}: {
  wref: WorldRef;
  worldName: string;
  onOpenSettings?: () => void;
}) {
  const t = useT();
  const [confirm, ConfirmDialog] = useConfirm();

  const refKey = 'worldId' in wref ? `w:${wref.worldId}` : `c:${wref.chatId}`;

  const backgrounds = useApp((s) => s.backgrounds);
  const folders = useApp((s) => s.folders);
  const addFolder = useApp((s) => s.addFolder);
  const addBackground = useApp((s) => s.addBackground);
  const updateBackground = useApp((s) => s.updateBackground);
  const focusBackgroundFolder = useApp((s) => s.focusBackgroundFolder);

  const [folderId, setFolderId] = useState<string | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [existingOpen, setExistingOpen] = useState(false);

  useEffect(() => {
    let stale = false;
    setFolderId(undefined);
    loadWorldBackgrounds(wref)
      .then(({ folderId: id }) => {
        if (!stale) setFolderId(id ?? null);
      })
      .catch((e) => {
        if (!stale) {
          setFolderId(null);
          toast.error(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);

  const folder = useMemo(
    () => folders.find((f) => f.id === folderId),
    [folders, folderId]
  );
  const isLinked = !!folderId && !!folder;

  const folderImages = useMemo(
    () => backgrounds.filter((b) => b.folderId === folderId),
    [backgrounds, folderId]
  );

  const backgroundFolders = useMemo(
    () => folders.filter((f) => f.scope === 'backgrounds'),
    [folders]
  );

  const handleCreateFolder = async () => {
    try {
      const id = addFolder(worldName || 'World', 'backgrounds');
      await linkWorldBackgrounds(wref, id);
      setFolderId(id);
      toast.success(t('world.bg.linked'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePickFolder = async (id: string) => {
    try {
      await linkWorldBackgrounds(wref, id);
      setFolderId(id);
      toast.success(t('world.bg.linked'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleUnlink = async () => {
    if (!folderId) return;
    try {
      await linkWorldBackgrounds(wref, null);
      setFolderId(null);
      toast.success(t('world.bg.unlinked'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenFolder = () => {
    if (folderId) focusBackgroundFolder(folderId);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!folderId || !files) return;
    const taken = backgrounds
      .filter((b) => b.folderId === folderId)
      .map((b) => b.name);

    for (const file of Array.from(files).filter((f) => f.type.startsWith('image/'))) {
      try {
        const base =
          toSnake(file.name.replace(/\.[^.]+$/, '')) || 'image';
        const result = await storeBackground(file, base);
        const name = uniqueName(base, taken);
        const id = addBackground(name, result.url);
        updateBackground(id, { folderId });
        taken.push(name);

        if (result.converted) {
          toast.success(
            t('bg.tab.saved', {
              before: formatBytes(result.before),
              after: formatBytes(result.size),
            })
          );
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('world.bg.lead')}</p>

      {'chatId' in wref && (
        <section className="rounded-md border p-3" data-testid="bg-auto-section">
          <AutoBackground chatId={wref.chatId} />
        </section>
      )}

      <section className="rounded-md border p-3">
        <h3 className="mb-2 text-sm font-medium">{t('world.bg.folder')}</h3>

        {folderId === undefined ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : isLinked && folder ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{folder.name}</span>
            <span className="text-sm text-muted-foreground">
              {t('world.bg.count', { n: folderImages.length })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="max-md:h-10"
              onClick={handleOpenFolder}
              data-testid="bg-open"
            >
              {t('world.bg.open')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('world.bg.unlink')}
                    className="h-8 w-8 max-md:h-10 max-md:w-10"
                  />
                }
              >
                <DotsThree size={16} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleUnlink}>
                  {t('world.bg.unlink')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {t('world.bg.folderNone')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                className="max-md:h-10"
                onClick={handleCreateFolder}
                data-testid="bg-create"
              >
                {t('world.bg.create', { name: worldName })}
              </Button>
            </div>

            {backgroundFolders.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted-foreground">
                  {t('world.bg.pickFolder')}
                </label>
                <Select onValueChange={(v) => { if (v) void handlePickFolder(v) }}>
                  <SelectTrigger className="h-10 md:h-9">
                    <SelectValue placeholder={t('world.bg.pickFolder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {backgroundFolders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {'worldId' in wref && (
              <p className="text-xs text-muted-foreground">
                {t('world.bg.savedHint')}
              </p>
            )}
          </div>
        )}
      </section>

      {isLinked && folderId && (
        <>
          <MakeSet
            wref={wref}
            folderId={folderId}
            onOpenSettings={onOpenSettings}
          />

          <section
            className="flex flex-col gap-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleUpload(e.dataTransfer.files);
            }}
            data-testid="bg-images"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{t('world.bg.images')}</h3>
              <div className="flex flex-wrap gap-2">
                {isLinked && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="max-md:h-10"
                    onClick={() => setExistingOpen(true)}
                    data-testid="bg-add-existing"
                  >
                    {t('world.bg.addExisting')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="max-md:h-10"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="bg-add"
                >
                  {t('world.bg.add')}
                </Button>
              </div>
              {isLinked && folder && (
                <AddExistingDialog open={existingOpen} onOpenChange={setExistingOpen} folderId={folder.id} folderName={folder.name} />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>

            {folderImages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('world.bg.imagesEmpty')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {folderImages.map((item) => (
                  <ImageCard
                    key={item.id}
                    item={item}
                    folderId={folderId}
                    all={backgrounds}
                    confirm={confirm}
                  />
                ))}
              </div>
            )}
          </section>

          <NameWithVision folderId={folderId} />
        </>
      )}

      {ConfirmDialog}
    </div>
  );
}
