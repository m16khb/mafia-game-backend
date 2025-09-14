import { Player } from './player.entity';

/**
 * Player 엔티티의 AI 페르소나 관련 기능을 테스트합니다.
 * 페르소나 할당, 확인, 제거 등의 비즈니스 로직을 검증합니다.
 */
describe('플레이어 엔티티', () => {
  let player: Player;

  beforeEach(() => {
    player = new Player();
    player.id = 1;
    player.name = 'Test Player';
    player.isAi = true;
  });

  describe('AI 페르소나 메서드', () => {
    /**
     * AI 플레이어에게 페르소나를 성공적으로 할당할 수 있는지 테스트합니다.
     */
    it('AI 플레이어에게 페르소나를 할당해야 함', () => {
      const personaId = 'detective-holmes';
      
      player.assignAiPersona(personaId);
      
      expect(player.aiPersonaId).toBe(personaId);
    });

    /**
     * 인간 플레이어에게 페르소나를 할당하려고 할 때 오류를 발생시키는지 테스트합니다.
     * 비즈니스 규칙 위반을 방지하는 보호 로직을 검증합니다.
     */
    it('인간 플레이어에게 페르소나를 할당할 때 오류를 발생시켜야 함', () => {
      player.isAi = false;
      
      expect(() => {
        player.assignAiPersona('detective-holmes');
      }).toThrow('Cannot assign persona to non-AI player');
    });

    /**
     * AI 페르소나가 할당되어 있는지 올바르게 확인하는지 테스트합니다.
     * 할당 전후의 상태 변화를 정확히 감지합니다.
     */
    it('AI 페르소나가 할당되었는지 확인해야 함', () => {
      expect(player.hasAiPersona()).toBe(false);
      
      player.assignAiPersona('detective-holmes');
      
      expect(player.hasAiPersona()).toBe(true);
    });

    /**
     * 인간 플레이어에 대해서는 페르소나 ID가 있어도 false를 반환하는지 테스트합니다.
     * AI 플레이어인 경우에만 페르소나가 유효한 비즈니스 로직을 검증합니다.
     */
    it('인간 플레이어의 페르소나 확인에 대해 false를 반환해야 함', () => {
      player.isAi = false;
      player.aiPersonaId = 'detective-holmes';
      
      expect(player.hasAiPersona()).toBe(false);
    });

    /**
     * AI 페르소나 할당을 성공적으로 제거할 수 있는지 테스트합니다.
     * 제거 후 상태가 올바르게 변경되는지 확인합니다.
     */
    it('AI 페르소나를 지워야 함', () => {
      player.assignAiPersona('detective-holmes');
      expect(player.hasAiPersona()).toBe(true);
      
      player.clearAiPersona();
      
      expect(player.hasAiPersona()).toBe(false);
      expect(player.aiPersonaId).toBeUndefined();
    });
  });
});