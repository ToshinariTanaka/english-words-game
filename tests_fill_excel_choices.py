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
    assert "correct が日本語のため choice1〜choice3 に英語を含めないでください" in errors


def test_prompt_explains_japanese_correct_requires_japanese_choices():
    prompt = mod.build_prompt([mod.RowItem(2, "1", "A1", "ad", "広告")])
    assert "correct が日本語なら choice1〜choice3 も必ず日本語" in prompt
    assert "英単語そのもの、英語の類義語、英語表現" in prompt
    assert "question が英単語で correct が日本語の場合は、日本語4択問題" in prompt


if __name__ == "__main__":
    test_parse_response_and_validate_success()
    test_validate_detects_blank_and_duplicates()
    test_strip_code_fence_csv()
    test_validate_rejects_english_choices_when_correct_is_japanese()
    test_prompt_explains_japanese_correct_requires_japanese_choices()
    print("tests_fill_excel_choices: PASS")
