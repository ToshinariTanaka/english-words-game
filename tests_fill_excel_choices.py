import importlib.util
import sys
from pathlib import Path

module_path = Path(__file__).parent / "tools" / "fill_excel_choices.py"
spec = importlib.util.spec_from_file_location("fill_excel_choices", module_path)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)


def test_parse_response_and_validate_success():
    row = mod.RowItem(2, "1", "A1", "apple", "りんご")
    parsed = mod.parse_response("row_number,choice1,choice2,choice3\n1,みかん,バナナ,ぶどう\n")
    assert parsed == {"1": {"choice1": "みかん", "choice2": "バナナ", "choice3": "ぶどう"}}
    assert mod.validate_batch([row], parsed) == {}


def test_validate_detects_blank_and_duplicates():
    row = mod.RowItem(2, "1", "A1", "apple", "りんご")
    parsed = {"1": {"choice1": "りんご", "choice2": "", "choice3": "りんご"}}
    errors = mod.validate_batch([row], parsed)["1"]
    assert "choice1〜choice3に空欄があります" in errors
    assert "correct と choice1〜choice3 が重複しています" in errors
    assert "choice1〜choice3 同士が重複しています" in errors


def test_strip_code_fence_csv():
    text = "```csv\nrow_number,choice1,choice2,choice3\n7,a,b,c\n```"
    assert mod.parse_response(text)["7"]["choice3"] == "c"


def test_validate_rejects_english_choices_when_correct_is_japanese():
    row = mod.RowItem(2, "1", "A1", "ad", "広告")
    parsed = {"1": {"choice1": "advertisement", "choice2": "notice", "choice3": "announcement"}}
    errors = mod.validate_batch([row], parsed)["1"]
    assert "correct が日本語を含むため choice1〜choice3 に英字[A-Za-z]を含めないでください" in errors


def test_validate_allows_japanese_choices_when_correct_is_japanese():
    row = mod.RowItem(2, "1", "A1", "ad", "広告")
    parsed = {"1": {"choice1": "住所", "choice2": "案内", "choice3": "発表"}}
    assert mod.validate_batch([row], parsed) == {}


def test_validate_allows_english_choices_when_correct_is_english():
    row = mod.RowItem(2, "1", "A1", "an identifying mark", "sign")
    parsed = {"1": {"choice1": "symbol", "choice2": "signal", "choice3": "gesture"}}
    assert mod.validate_batch([row], parsed) == {}


def test_prompt_explains_japanese_correct_requires_japanese_choices():
    prompt = mod.build_prompt([mod.RowItem(2, "1", "A1", "ad", "広告")])
    assert "correct が日本語を含む場合、choice1〜choice3 は必ず日本語のみ" in prompt
    assert "英単語、英語フレーズ、英語類義語" in prompt
    assert "A-Z または a-z が1文字でも含まれていたら不正" in prompt
    assert "question が英単語で correct が日本語の場合は、日本語4択問題" in prompt


if __name__ == "__main__":
    test_parse_response_and_validate_success()
    test_validate_detects_blank_and_duplicates()
    test_strip_code_fence_csv()
    test_validate_rejects_english_choices_when_correct_is_japanese()
    test_validate_allows_japanese_choices_when_correct_is_japanese()
    test_validate_allows_english_choices_when_correct_is_english()
    test_prompt_explains_japanese_correct_requires_japanese_choices()
    print("tests_fill_excel_choices: PASS")
