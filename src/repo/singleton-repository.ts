import type { Hlc } from '@/hlc';
import type { EntityDefinition, BaseEntity } from '@/schema';
import { formatEntityId } from '@/schema';
import type { EventBus } from '@/reactive';
import type { EntityEvent } from '@/reactive';
import type { EntityStore } from '@/store';
import { Repository } from './repository';

export class SingletonRepository<T> {
  private readonly repo: Repository<T>;
  private readonly deterministicId: string;

  constructor(
    definition: EntityDefinition<T>,
    store: EntityStore,
    hlc: { current: Hlc },
    eventBus: EventBus<EntityEvent>,
    ensurePartition?: (entityName: string, partitionKey: string) => Promise<void>,
  ) {
    this.repo = new Repository(definition, store, hlc, eventBus, ensurePartition);
    this.deterministicId = formatEntityId(definition.name, '_', definition.name);
  }

  get(): (T & BaseEntity) | undefined {
    return this.repo.get(this.deterministicId);
  }

  save(entity: T & Partial<BaseEntity>): void {
    this.repo.save({ ...entity, id: this.deterministicId });
  }

  delete(): boolean {
    return this.repo.delete(this.deterministicId);
  }

  observe() {
    return this.repo.observe(this.deterministicId);
  }

  dispose(): void {
    this.repo.dispose();
  }
}
